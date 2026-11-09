import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderBriefMarkdown } from "../brief/render.js";
import { selfCheckItems } from "../brief/selfcheck.js";
import { CONFIG_FILE, defaultConfig, loadConfig, parseConfigText, type OpendrsConfig } from "../domain/config.js";
import type { Decision, ModelWeights, Tier } from "../domain/types.js";
import { OpendrsError } from "../domain/types.js";
import { scoreDiff } from "../engine.js";
import { git, gitMaybe } from "../git/exec.js";
import { matchAny } from "../git/glob.js";
import { buildHistoryIndex } from "../git/history.js";
import { TRUST_REPO_LLM_ENV } from "../llm/provider.js";
import { assignReviewer, suggestReviewers } from "../policy/reviewers.js";
import { cell } from "../report/escape.js";
import { renderMarkdown } from "../report/markdown.js";
import { HOLD_LABEL, changesRequested, eligibleMarker, noreplyLogin, ownApprovals, readEligibleSince, reconcileApproval, stopMerge, withdraw } from "./approval.js";
import { GitHubError, type IssueComment, isSelf, sameLogin, unlessForbidden, type GitHubClient } from "./github.js";
import { parseSelfCheck, renderSelfCheckLine } from "./selfcheck.js";
import { changeNotice, readState, rescoreLine, stateMarker } from "./state.js";
import type { WorkflowIO } from "./workflow.js";

export { APPROVAL_MARKER } from "./approval.js";
export const COMMENT_MARKER = "<!-- opendrs -->";
/** On a PR while its landing delay runs; the scheduled sweep re-scores the PRs that carry it. */
export const LANDING_LABEL = "opendrs:landing";
const RISK_LABELS = ["risk:green", "risk:yellow", "risk:red"];
const CAPTAIN_LABELS = ["captain:careful", "captain:standard", "captain:quick"];
const COMMENT_FORBIDDEN =
  "Could not write the PR comment (403): the token needs `pull-requests: write`. Fork PRs get a read-only token on `pull_request` events.";
const PREDICTABLE_SAMPLING =
  "sampling is predictable; set sample-salt to a secret. Without it, anyone can compute which PR numbers " +
  "autoApprove.sampleRate sends to a human, and time a risky PR for one that is not sampled.";

export interface ActionInputs {
  token: string;
  /** Read .opendrs.yml (and the model) from the PR's base commit. */
  baseConfig: boolean;
  llmApiKey?: string;
  comment: boolean;
  labels: boolean;
  /** Mixed into the drift-sampling key; a secret makes the sample unpredictable. */
  sampleSalt?: string;
  /** Build the review brief and add it to the comment, job summary and brief/brief-file outputs. */
  brief: boolean;
  /** Post a short new comment when a re-score changes the tier or the decision. Needs `brief` and `comment`. */
  notifyChanges: boolean;
}

/** The fields of the `pull_request` webhook payload the action uses. */
export interface PullRequest {
  number: number;
  node_id: string;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  draft?: boolean;
  /** The account that opened the PR; `type` is "Bot" for a GitHub App, "User" otherwise. */
  user?: { login: string; type?: string } | null;
  requested_reviewers?: Array<{ login: string }>;
  base: { sha: string; ref: string; repo: { full_name: string } };
  head: { sha: string; ref: string; repo: { full_name: string } | null };
}

export interface ActionDeps {
  repoDir: string;
  event: unknown;
  inputs: ActionInputs;
  client: GitHubClient;
  io: WorkflowIO;
  /** Process environment; the LLM key is exported into it. */
  env: NodeJS.ProcessEnv;
}

export interface ActionOutcome {
  score: number;
  tier: Tier;
  decision: Decision;
  approved: boolean;
}

function readPullRequest(event: unknown): PullRequest {
  const pr = (event as { pull_request?: PullRequest } | null)?.pull_request;
  if (!pr || typeof pr.number !== "number" || !pr.base?.sha || !pr.head?.sha) {
    throw new OpendrsError("opendrs needs a pull_request event (or a schedule / workflow_dispatch sweep): this event has no pull_request payload", "usage");
  }
  return pr;
}

async function requireCommit(repoDir: string, sha: string, which: string): Promise<void> {
  if ((await gitMaybe(repoDir, ["cat-file", "-e", `${sha}^{commit}`])) === undefined) {
    throw new OpendrsError(`${which} commit ${sha} is not in the checkout. Use actions/checkout with fetch-depth: 0.`, "git");
  }
}

async function loadSettings(d: ActionDeps, base: string): Promise<{ config: OpendrsConfig; model?: ModelWeights }> {
  const text = await gitMaybe(d.repoDir, ["show", `${base}:${CONFIG_FILE}`]);
  const baseConfig = text === undefined ? defaultConfig() : parseConfigText(text);
  if (!d.inputs.baseConfig) {
    d.io.warning(
      `base-config is false: ${CONFIG_FILE} is read from the PR checkout, so a PR can change its own gate. ` +
        "Auto-approval still refuses PRs that modify it. The llm section and the model path still come from the base commit.",
    );
    // Never let a PR choose where the LLM key is sent (llm.baseUrl) or which secret is exported (llm.apiKeyEnv).
    return { config: { ...(await loadConfig(d.repoDir)), llm: baseConfig.llm, model: baseConfig.model } };
  }
  d.io.info(text === undefined ? `No ${CONFIG_FILE} on base commit ${base}: using defaults.` : `Using ${CONFIG_FILE} from base commit ${base}.`);
  const config = baseConfig;

  const raw = await gitMaybe(d.repoDir, ["show", `${base}:${config.model}`]);
  if (raw === undefined) return { config };
  try {
    const model = JSON.parse(raw) as ModelWeights;
    if (model.version === 1 && typeof model.intercept === "number") {
      d.io.info(`Using calibrated model ${config.model} from the base commit.`);
      return { config, model };
    }
  } catch {
    // fall through to the warning
  }
  d.io.warning(`${config.model} on the base commit is not a valid model; it is ignored.`);
  return { config };
}

const llmKeyEnv = (config: OpendrsConfig) =>
  config.llm.apiKeyEnv ?? (config.llm.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY");

/**
 * Whether GitHub maps the head commit's author email to the account that opened the PR (the
 * email is otherwise whatever the PR author typed), and that account's verified emails in this PR.
 */
async function prAuthor(d: ActionDeps, pr: PullRequest): Promise<{ verified: boolean; emails: Set<string> }> {
  const commits =
    (await unlessForbidden(
      () => d.client.listPullCommits(pr.number),
      () => d.io.warning("Could not list the PR's commits (403): give the job `pull-requests: read`. The author's expertise counts as unknown."),
    )) ?? [];
  const login = pr.user?.login;
  const theirs = commits.filter((c) => sameLogin(c.author?.login, login));
  const head = commits.at(-1);
  const verified = head !== undefined && head.sha === pr.head.sha && theirs.includes(head);
  if (!verified) d.io.info(`The head commit's author is not verified as the PR's author${login ? ` @${login}` : ""}: expertise signals count as unknown.`);
  const emails = theirs.flatMap((c) => (c.commit.author?.email ? [c.commit.author.email.toLowerCase()] : []));
  return { verified, emails: new Set(emails) };
}

/**
 * The GitHub login `assignReviewer` picks for this PR from its suggested reviewers (noreply logins
 * only), picked by PR so reruns agree; never the PR's own author. Shared by the review request and
 * the captain line (spec §7.2), so the two always agree.
 */
function pickReviewerLogin(pr: PullRequest, reviewers: string[]): string | undefined {
  const logins = reviewers.map(noreplyLogin).filter((l): l is string => l !== undefined);
  const login = assignReviewer(logins, `${pr.base.repo.full_name}#${pr.number}`);
  return login !== undefined && !sameLogin(login, pr.user?.login) ? login : undefined;
}

/**
 * For a PR that needs a human, ask one expert to review; best-effort. Returns the login when a
 * review was requested.
 */
async function requestOneReviewer({ client, io }: ActionDeps, pr: PullRequest, reviewers: string[], decision: Decision): Promise<string | undefined> {
  if (decision !== "human-review") return undefined;
  const login = pickReviewerLogin(pr, reviewers);
  if (login === undefined || pr.requested_reviewers?.some((r) => sameLogin(r.login, login))) return undefined;
  // Re-requesting a review resets one that was already submitted.
  if ((await client.listReviews(pr.number)).some((r) => sameLogin(r.user?.login, login))) return undefined;
  try {
    await client.requestReviewers(pr.number, [login]);
    return login;
  } catch (e) {
    if (!(e instanceof GitHubError && (e.status === 403 || e.status === 422))) throw e;
    io.warning(`Could not request a review from @${login} (${e.message}). Ask them by hand.`);
    return undefined;
  }
}

/** Every path the PR changes, from the merge-base; renames count as delete + add. */
async function changedFiles(repoDir: string, base: string, head: string): Promise<string[]> {
  const out = await git(repoDir, ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`]);
  return out.split("\0").filter(Boolean);
}

export async function runAction(d: ActionDeps): Promise<ActionOutcome> {
  return runPullRequest(d, readPullRequest(d.event));
}

/**
 * The eligibility time from opendrs's own comment, unless it predates the comment by more than two
 * minutes: a comment cannot vouch for a time before it existed, so another bot's comment that copies
 * the marker cannot backdate the clock by more than that. The marker's time is taken seconds before
 * the comment is written (`now` in the approval, then the comment call), so two minutes is ample.
 */
const MAX_RUN_MS = 2 * 60_000;
function trustedSince(comment: IssueComment | undefined, head: string): Date | undefined {
  const since = readEligibleSince(comment?.body ?? undefined, head);
  const created = comment?.created_at ? Date.parse(comment.created_at) : NaN;
  if (since === undefined || Number.isNaN(created)) return since;
  return since.getTime() >= created - MAX_RUN_MS ? since : undefined;
}

/** Score, comment, label and reconcile the approval of one PR; the sweep calls this for each labelled PR. */
export async function runPullRequest(d: ActionDeps, pr: PullRequest): Promise<ActionOutcome> {
  try {
    return await scorePullRequest(d, pr);
  } catch (e) {
    await failClosed(d, pr);
    throw e;
  }
}

/**
 * After an error, an earlier approval and auto-merge must not stay in place unchecked: dismiss our
 * approvals and stop merging. When our approvals cannot even be listed, stop merging regardless.
 */
async function failClosed({ client, io }: ActionDeps, pr: PullRequest): Promise<void> {
  io.warning("opendrs failed, so it withdraws its approval and auto-merge on this PR, if any.");
  try {
    const own = await ownApprovals(client, pr.number, await client.viewerLogin());
    await withdraw(client, io, pr, own, "opendrs could not score the latest commit");
  } catch (e) {
    io.warning(`Could not check opendrs's approvals (${e instanceof Error ? e.message : String(e)}); stopping auto-merge anyway.`);
    await stopMerge(client, io, pr);
  }
}

async function scorePullRequest(d: ActionDeps, pr: PullRequest): Promise<ActionOutcome> {
  const { client, io } = d;
  await requireCommit(d.repoDir, pr.base.sha, "Base");
  await requireCommit(d.repoDir, pr.head.sha, "Head");

  const { config, model } = await io.group("Configuration", () => loadSettings(d, pr.base.sha));
  if (d.inputs.llmApiKey) d.env[llmKeyEnv(config)] = d.inputs.llmApiKey;
  // loadSettings always takes the llm section from the base commit, so a PR cannot have set it.
  d.env[TRUST_REPO_LLM_ENV] = "1";
  const predictable = config.autoApprove.enabled && config.autoApprove.sampleRate > 0 && !d.inputs.sampleSalt;
  if (predictable) io.warning(PREDICTABLE_SAMPLING);

  const checkRuns =
    (await unlessForbidden(
      () => client.successfulChecks(pr.head.sha, d.env.GITHUB_RUN_ID),
      () => io.warning("Could not read check runs (403): give the job `checks: read`. Required AI-review checks count as missing."),
    )) ?? [];
  // Anyone can publish a check run under any name: a check pinned to an app counts only from that app.
  const pinned = new Map(config.autoApprove.requireAiReview.checks.flatMap((c) => (typeof c === "string" ? [] : [[c.name, c.app] as const])));
  const successfulChecks = checkRuns.filter((r) => !pinned.has(r.name) || pinned.get(r.name) === r.app).map((r) => r.name);

  const author = await prAuthor(d, pr);
  const mergeBase = (await git(d.repoDir, ["merge-base", pr.base.sha, pr.head.sha])).trim();
  const history = await buildHistoryIndex(d.repoDir, mergeBase, config);

  const viewer = await client.viewerLogin();
  if (viewer === undefined) io.info("Could not read the token's login: opendrs's own comment and approvals are matched by marker and bot account.");
  const changesRequestedBy = await changesRequested(client, pr.number, viewer);

  // opendrs's own comment carries the previous run's state; read now so the drift detector has its
  // baseline (first/firstRun) before scoring runs, and reused below for the landing delay and the rescore line.
  const comments = d.inputs.comment ? await unlessForbidden(() => client.listComments(pr.number), () => io.warning(COMMENT_FORBIDDEN)) : undefined;
  // The newest one: GitHub lists comments oldest first.
  const mine = comments?.filter((c) => isSelf(c.user, viewer) && (c.body ?? "").includes(COMMENT_MARKER)).at(-1);
  // Re-score visibility needs the state marker, which the brief:false byte-equal guarantee forbids adding.
  const previousState = d.inputs.brief ? readState(mine?.body ?? undefined) : undefined;
  const runNumber = previousState ? previousState.run + 1 : 1;
  // Spec §6.4/§7.3: first run → first = this head, firstRun = 1; later runs keep the stored first and
  // firstRun, now persisted in the marker so it survives past the run that migrates a 0.3.x marker
  // (no `first`); a marker from before `firstRun=` existed falls back to the old guess (spec §6.4).
  const firstHead = previousState === undefined ? pr.head.sha : previousState.first ?? previousState.head;
  const firstRun =
    previousState === undefined ? 1 : previousState.firstRun ?? (previousState.first !== undefined ? 1 : previousState.run);

  const result = await io.group("Score", async () => {
    const r = await scoreDiff({
      repoDir: d.repoDir,
      base: pr.base.sha,
      head: pr.head.sha,
      config,
      model,
      history,
      authorVerified: author.verified,
      account: pr.user ? { login: pr.user.login, type: pr.user.type } : undefined,
      title: pr.title,
      description: pr.body ?? undefined,
      // Keyed by PR, not head sha, so pushing another commit cannot re-roll the drift sample.
      pr: {
        successfulChecks,
        number: pr.number,
        samplingKey: `${pr.base.repo.full_name}#${pr.number}#${d.inputs.sampleSalt ?? ""}`,
        draft: pr.draft,
        changesRequestedBy,
      },
      brief: d.inputs.brief ? { maxTokens: config.brief.maxTokens, firstHead, firstRun, onError: (m) => io.warning(m) } : undefined,
    });
    io.info(`score ${r.score.toFixed(3)}, tier ${r.tier}, decision ${r.policy.decision}`);
    for (const reason of r.policy.reasons) io.info(`  - ${reason}`);
    return r;
  });
  io.setOutput("score", result.score.toFixed(4));
  io.setOutput("tier", result.tier);
  io.setOutput("decision", result.policy.decision);
  io.setOutput("captain", result.brief?.captain?.priority ?? "");
  if (result.brief) {
    io.setOutput("brief", renderBriefMarkdown(result.brief));
    const dir = d.env.RUNNER_TEMP ?? tmpdir();
    const file = join(dir, `opendrs-brief-${pr.number}.json`);
    try {
      await writeFile(file, JSON.stringify(result.brief));
      io.setOutput("brief-file", file);
    } catch (e) {
      io.warning(`Could not write the brief file (${e instanceof Error ? e.message : String(e)}); the \`brief-file\` output is empty. The \`brief\` output still has the full brief.`);
      io.setOutput("brief-file", "");
    }
  } else {
    io.setOutput("brief", "");
    io.setOutput("brief-file", "");
  }

  // A push during scoring: the comment, labels and reviewer request belong to the run for the new head.
  const current = await client.pullHeadSha(pr.number);
  if (current !== pr.head.sha) {
    io.notice(`The PR head moved to ${current} while opendrs scored ${pr.head.sha}: not approving. The run for the new head decides.`);
    return { score: result.score, tier: result.tier, decision: result.policy.decision, approved: false };
  }

  const files = await changedFiles(d.repoDir, pr.base.sha, pr.head.sha);
  // Exclude the PR author's verified emails, not the head commit's claimed one, which they control.
  const paths = files.filter((f) => !matchAny(config.paths.ignore, f));
  result.policy.suggestedReviewers = suggestReviewers(history, paths, undefined, 3 + author.emails.size, result.tier !== "green")
    .filter((email) => !author.emails.has(email))
    .slice(0, 3);
  // The captain line shows the same login the review request uses, whether or not a request is sent.
  if (result.brief?.captain) result.brief.captain.reviewer = pickReviewerLogin(pr, result.policy.suggestedReviewers);
  const assigned = await requestOneReviewer(d, pr, result.policy.suggestedReviewers, result.policy.decision);

  // Spec §2.3: read strictly from the exact head commit's own message — never an ancestor's, so a
  // push that drops the marker (fixup, squash, amend) reads as "no self-check", never a stale reuse.
  const headMessage = await gitMaybe(d.repoDir, ["log", "-1", "--format=%B", pr.head.sha]);
  const selfCheckEntries = parseSelfCheck(headMessage);
  const selfCheckLine = result.brief ? renderSelfCheckLine(selfCheckEntries, new Set(selfCheckItems(result.brief).map((i) => i.id))) : undefined;

  // opendrs's own comment carries the time this head became eligible, so a landing delay survives across runs.
  const labels = pr.labels.map((l) => l.name);
  if (!d.inputs.comment && result.policy.landingDelayMinutes > 0) {
    io.warning("The landing delay needs the comment input: the time a head became eligible is kept in opendrs's comment. Not approving.");
  }
  const approval = await io.group("Approval", () =>
    reconcileApproval({ client, io, pr, config, result, files, viewer, now: new Date(), eligibleSince: trustedSince(mine, pr.head.sha), labels, commentEnabled: d.inputs.comment }),
  );

  const rescore = previousState ? rescoreLine(previousState, runNumber, pr.head.sha, result.score, result.tier) : undefined;

  const warning = predictable ? `\n\n**Warning:** ${PREDICTABLE_SAMPLING}` : "";
  const eligible = approval.eligibleSince ? `\n${eligibleMarker(pr.head.sha, approval.eligibleSince)}` : "";
  const reviewer = assigned ? `\n**Reviewer:** @${assigned} (one of the top experts, picked at random so the work spreads)` : "";
  const state = d.inputs.brief
    ? `\n${stateMarker({ head: pr.head.sha, first: firstHead, firstRun, score: result.score, tier: result.tier, decision: result.policy.decision, run: runNumber })}`
    : "";
  const assemble = (report: string) =>
    `${report.startsWith(COMMENT_MARKER) ? report : `${COMMENT_MARKER}\n${report}`}${warning}\n\n**Auto-approval:** ${cell(approval.status)}${reviewer}${eligible}${state}`;
  const body = assemble(renderMarkdown(result, { rescoreLine: rescore, selfCheckLine }));
  // Over GitHub's limit the comment is rendered again without the brief, never edited by a pattern
  // over content the PR controls; the full brief stays in the `brief` output.
  const capped = body.length > 60_000 && result.brief ? assemble(renderMarkdown(result, { omitBrief: true, rescoreLine: rescore, selfCheckLine })) : body;

  if (comments) {
    let written = false;
    await unlessForbidden(
      async () => {
        if (mine) await client.updateComment(mine.id, capped);
        else await client.createComment(pr.number, capped);
        written = true;
      },
      () => io.warning(COMMENT_FORBIDDEN),
    );
    // A short, separate notice so a re-score that changes the outcome is not missed in an updated-in-place
    // comment; it never carries the opendrs marker, so it is never mistaken for the main comment. Only after
    // the report itself was written, so a notice never announces a change the report does not show.
    if (written && d.inputs.notifyChanges && previousState && (previousState.tier !== result.tier || previousState.decision !== result.policy.decision)) {
      await unlessForbidden(
        () => client.createComment(pr.number, changeNotice(previousState, result.score, result.tier, result.policy.decision)),
        () => io.warning(COMMENT_FORBIDDEN),
      );
    }
  }

  // The sweep finds PRs waiting out their delay by this label, so it is kept whatever the labels input
  // says, and also while on hold, so the sweep resumes the PR once the hold label is removed.
  const landing = approval.pendingUntil !== undefined || (labels.includes(HOLD_LABEL) && approval.eligibleSince !== undefined);
  if (landing !== labels.includes(LANDING_LABEL)) {
    await unlessForbidden(
      () => (landing ? client.addLabels(pr.number, [LANDING_LABEL]) : client.removeLabel(pr.number, LANDING_LABEL)),
      () => io.warning(`Could not ${landing ? "add" : "remove"} the ${LANDING_LABEL} label (403): the token needs \`pull-requests: write\`.`),
    );
  }

  if (d.inputs.labels) {
    const want = `risk:${result.tier}`;
    // Absent (captain.enabled: false, or no brief): no captain label is wanted, so a stale one is removed.
    const wantCaptain = result.brief?.captain ? `captain:${result.brief.captain.priority}` : undefined;
    await unlessForbidden(
      async () => {
        for (const label of labels) {
          if (RISK_LABELS.includes(label) && label !== want) await client.removeLabel(pr.number, label);
          if (CAPTAIN_LABELS.includes(label) && label !== wantCaptain) await client.removeLabel(pr.number, label);
        }
        if (!labels.includes(want)) await client.addLabels(pr.number, [want]);
        if (wantCaptain && !labels.includes(wantCaptain)) await client.addLabels(pr.number, [wantCaptain]);
      },
      () => io.warning("Could not set risk/captain labels (403): the token needs `pull-requests: write` (and `issues: write` to create new labels)."),
    );
  }

  io.summary(capped);
  return { score: result.score, tier: result.tier, decision: result.policy.decision, approved: approval.approved };
}
