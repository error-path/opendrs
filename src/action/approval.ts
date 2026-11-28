import type { OpendrsConfig } from "../domain/config.js";
import type { ScoreResult } from "../domain/types.js";
import { GitHubError, isSelf, unlessForbidden, type GitHubClient, type Review } from "./github.js";
import { selfModifiedPaths } from "./guard.js";
import type { PullRequest } from "./run.js";
import type { WorkflowIO } from "./workflow.js";

export const APPROVAL_MARKER = "<!-- opendrs-approval -->";
export const ELIGIBLE_MARKER = "opendrs-eligible";
export const HOLD_LABEL = "opendrs:hold";
const REVIEW_AFTER_MERGE_LABEL = "opendrs:review-after-merge";

/** Records in opendrs's comment when `head` first became eligible to land, so the landing delay survives reruns. */
export const eligibleMarker = (head: string, since: Date) => `<!-- ${ELIGIBLE_MARKER}: ${head} ${since.toISOString()} -->`;

/**
 * Reads when `head` first became eligible from opendrs's comment; a marker for another commit does not
 * count, so a push restarts the clock.
 *
 * Only the marker opendrs appends counts: the comment's last line, or the line before its state marker.
 * Everything the PR controls (file names, LLM text) comes earlier, so a marker forged there is ignored.
 *
 * @param body - The body of opendrs's own comment.
 * @param head - The PR's head commit.
 * @returns The recorded time, or undefined when the trailer holds no valid marker for `head`.
 */
export function readEligibleSince(body: string | undefined, head: string): Date | undefined {
  const lines = (body ?? "").trimEnd().split(/\r?\n/);
  if (lines.at(-1)?.startsWith("<!-- opendrs-state:")) lines.pop();
  const m = lines.at(-1)?.match(new RegExp(`^<!-- ${ELIGIBLE_MARKER}: (\\S+) (\\S+) -->$`));
  if (m?.[1] !== head) return undefined;
  const since = new Date(m[2]!);
  return Number.isNaN(since.getTime()) ? undefined : since;
}

/** Decisions that may land without a human approving first. */
const ELIGIBLE = new Set<ScoreResult["policy"]["decision"]>(["auto-approve", "deferred-review"]);

/** The login behind a GitHub noreply address (`<id>+<login>@` or `<login>@users.noreply.github.com`); other emails map to nothing. */
export const noreplyLogin = (email: string) => email.match(/^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i)?.[1];

const APPROVAL_FORBIDDEN =
  "GitHub refused the approval (403). In Settings > Actions > General > Workflow permissions, enable " +
  "\"Allow GitHub Actions to create and approve pull requests\", and give the job `pull-requests: write`.";

const staleApprovalsUnverified = (branch: string) =>
  `Not approving: could not confirm that ${branch} requires an approval and dismisses it when new commits are pushed. ` +
  `Without that, a commit pushed after opendrs approves can merge on the earlier approval. In Settings > Rules > Rulesets, ` +
  `add an active branch ruleset for ${branch} with "Require a pull request before merging", "Required approvals" of at least 1 ` +
  `and "Dismiss stale pull request approvals when new commits are pushed". Classic branch protection with the same settings ` +
  `also counts, but only when github-token can read it (Administration: read), which the default GITHUB_TOKEN cannot.`;

export interface ApprovalInput {
  client: GitHubClient;
  io: WorkflowIO;
  pr: PullRequest;
  config: OpendrsConfig;
  result: ScoreResult;
  /** Every path the PR changes (both sides of renames). */
  files: string[];
  /** Login of the token's user (undefined = unknown); only its own marked approvals are ever dismissed. */
  viewer: string | undefined;
  now: Date;
  /** When this head first became eligible, from opendrs's own comment; undefined starts the landing delay now. */
  eligibleSince?: Date;
  /** The PR's current labels. */
  labels: string[];
  /** The Action's comment input; a landing delay keeps its clock in opendrs's comment. */
  commentEnabled: boolean;
}

export interface ApprovalOutcome {
  approved: boolean;
  /** One line for the PR comment. */
  status: string;
  /** Set while the PR is eligible: the caller writes it into the comment as `eligibleMarker`. */
  eligibleSince?: Date;
  /** Set while the landing delay is still running. */
  pendingUntil?: Date;
}

const isFork = (pr: PullRequest) => pr.head.repo?.full_name !== pr.base.repo.full_name;

function blockers({ config, result, files, pr, commentEnabled }: ApprovalInput): string[] {
  const out: string[] = [];
  if (!config.autoApprove.enabled) out.push("autoApprove.enabled is false (comment-only mode)");
  if (!ELIGIBLE.has(result.policy.decision)) out.push(`decision is ${result.policy.decision}`);
  if (result.policy.landingDelayMinutes > 0 && !commentEnabled) out.push("landing delay needs the comment input");
  const touched = selfModifiedPaths(files, [config.model.replace(/^\.\//, "")]);
  if (touched.length) {
    const shown = touched.slice(0, 5).join(", ") + (touched.length > 5 ? `, and ${touched.length - 5} more` : "");
    out.push(`self-modification guard: the PR changes ${shown}`);
  }
  if (isFork(pr)) out.push("the PR comes from a fork");
  return out;
}

/**
 * Whether `branch` requires an approval and dismisses it on a new push, by an active ruleset or by
 * classic protection. A 403 or 404 means it cannot be verified; other errors propagate.
 */
async function dismissesStaleApprovals(client: GitHubClient, branch: string): Promise<boolean> {
  const unverifiable = (e: unknown): undefined => {
    if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) return undefined;
    throw e;
  };
  const rules = (await client.pullRequestRules(branch).catch(unverifiable)) ?? [];
  if (rules.some((r) => r.dismiss_stale_reviews_on_push) && rules.some((r) => (r.required_approving_review_count ?? 0) >= 1)) return true;
  const classic = await client.classicReviewProtection(branch).catch(unverifiable);
  return classic?.dismiss_stale_reviews === true && (classic.required_approving_review_count ?? 0) >= 1;
}

/** This token's current opendrs approvals on the PR. */
export async function ownApprovals(client: GitHubClient, pr: number, viewer: string | undefined): Promise<Review[]> {
  return (await client.listReviews(pr)).filter(
    (r) => r.state === "APPROVED" && isSelf(r.user, viewer) && (r.body ?? "").includes(APPROVAL_MARKER),
  );
}

/**
 * Reviewers whose latest approval, change request or dismissal is a change request. opendrs's own
 * approvals are left out, so they never clear a change request made by the same account.
 */
export async function changesRequested(client: GitHubClient, pr: number, viewer: string | undefined): Promise<string[]> {
  const latest = new Map<string, string>();
  // GitHub lists reviews oldest first.
  for (const r of await client.listReviews(pr)) {
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)) continue;
    if (isSelf(r.user, viewer) && (r.body ?? "").includes(APPROVAL_MARKER)) continue;
    latest.set(r.user?.login ?? "ghost", r.state);
  }
  return [...latest].filter(([, state]) => state === "CHANGES_REQUESTED").map(([login]) => login);
}

/**
 * Dismiss `own` approvals and, when there were any, stop the auto-merge or queue entry they led
 * to. With no approval of ours, auto-merge is left alone: a human may have turned it on.
 */
export async function withdraw(client: GitHubClient, io: WorkflowIO, pr: PullRequest, own: Review[], message: string): Promise<void> {
  for (const r of own) {
    await unlessForbidden(
      async () => {
        await client.dismissReview(pr.number, r.id, message);
        io.notice(`Dismissed opendrs's earlier approval: ${message}`);
      },
      (e) => io.warning(`Could not dismiss opendrs's earlier approval (${e.message}). Dismiss it by hand.`),
    );
  }
  if (own.length) await stopMerge(client, io, pr);
}

/** GraphQL errors that mean there was nothing to stop. */
const NOTHING_TO_STOP = /\bnot\b[^.]*\b(enabled|queued|queue|auto-?merge)\b/i;

/** Best-effort: disable auto-merge and leave the merge queue, ignoring "not enabled / not queued". */
export async function stopMerge(client: GitHubClient, io: WorkflowIO, pr: PullRequest): Promise<void> {
  const steps: Array<[string, () => Promise<void>]> = [
    ["disable auto-merge", () => client.disableAutoMerge(pr.node_id)],
    ["remove the PR from the merge queue", () => client.dequeue(pr.node_id)],
  ];
  for (const [what, step] of steps) {
    try {
      await step();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!NOTHING_TO_STOP.test(message)) io.warning(`Could not ${what} (${message}). Check the PR by hand.`);
    }
  }
}

/**
 * Approve (and queue or auto-merge) only when every rail passes and neither `opendrs:hold` nor
 * a running landing delay holds the PR; otherwise dismiss this token's own earlier opendrs approvals.
 */
export async function reconcileApproval(a: ApprovalInput): Promise<ApprovalOutcome> {
  const { client, io, pr, result } = a;
  const own = await ownApprovals(client, pr.number, a.viewer);

  const reasons = blockers(a);
  // An approval must not outlive its commit: GitHub has to dismiss it when B is pushed after A was approved.
  if (!reasons.length && !(await dismissesStaleApprovals(client, pr.base.ref))) {
    io.warning(staleApprovalsUnverified(pr.base.ref));
    reasons.push(`cannot confirm that ${pr.base.ref} dismisses stale approvals on push (see the job log)`);
  }
  if (reasons.length) {
    io.info(`Not approving: ${reasons.join("; ")}.`);
    // A green PR held back (a freeze, a sample) has not risen in risk: say what held it.
    const message =
      !ELIGIBLE.has(result.policy.decision)
        ? result.tier === "green"
          ? `opendrs approval withdrawn: ${result.policy.reasons[0]}`
          : `Risk increased: ${result.tier} ${result.score.toFixed(2)}`
        : `opendrs approval withdrawn: ${reasons.join("; ")}`;
    await withdraw(client, io, pr, own, message);
    return { approved: false, status: `not approved: ${reasons.join("; ")}.` };
  }

  // A push during scoring would otherwise get an approval meant for the commit before it.
  const current = await client.pullHeadSha(pr.number);
  if (current !== pr.head.sha) {
    io.notice(`The PR head moved to ${current} while opendrs scored ${pr.head.sha}: not approving. The run for the new head decides.`);
    return { approved: false, status: "not approved: a new commit was pushed while scoring; the next run decides." };
  }

  // A human veto: the hold label and the landing delay both postpone, and nothing of ours may merge meanwhile.
  if (a.labels.includes(HOLD_LABEL)) {
    io.info(`Not approving: the PR has the ${HOLD_LABEL} label.`);
    await withdraw(client, io, pr, own, `opendrs approval withdrawn: ${HOLD_LABEL} label`);
    return { approved: false, status: `on hold (${HOLD_LABEL} label)`, eligibleSince: a.eligibleSince };
  }
  const since = a.eligibleSince ?? a.now;
  const delay = result.policy.landingDelayMinutes;
  const until = new Date(since.getTime() + delay * 60_000);
  if (delay > 0 && a.now < until) {
    const at = `${until.toISOString().slice(11, 16)} UTC`;
    io.info(`Not approving yet: the landing delay of ${delay} min runs until ${at}.`);
    await withdraw(client, io, pr, own, "opendrs approval withdrawn: the landing delay is still running");
    return {
      approved: false,
      status: `approves at ${at} unless someone requests changes, pushes, or adds ${HOLD_LABEL}`,
      eligibleSince: since,
      pendingUntil: until,
    };
  }

  const deferred = result.policy.decision === "deferred-review";
  let note = deferred ? " (deferred review)" : "";
  if (own.some((r) => r.commit_id === pr.head.sha)) {
    io.info("This head commit is already approved by opendrs.");
  } else {
    const body = deferred
      ? `${APPROVAL_MARKER}\nApproved by opendrs for deferred review: risk score ${result.score.toFixed(2)} (${result.tier}) ` +
        `for commit ${pr.head.sha}. It lands now; a human reviews it after merge.`
      : `${APPROVAL_MARKER}\nApproved by opendrs: risk score ${result.score.toFixed(2)} (${result.tier}) ` +
        `for commit ${pr.head.sha}. Every auto-approval rule passed.`;
    const done = await unlessForbidden(
      () => client.approve(pr.number, pr.head.sha, body).then(() => true),
      () => io.warning(APPROVAL_FORBIDDEN),
    );
    if (!done) return { approved: false, status: "not approved: GitHub refused the approval (see the job log)." };
    io.notice(`Approved${deferred ? " for deferred review" : ""}: risk ${result.score.toFixed(2)} (${result.tier}).`);
    // Only with the first approval of this head: re-requesting would reset a finished review.
    if (deferred) note = ` (deferred review: ${await requestDeferredReview(a)})`;
  }
  return { approved: true, status: `approved by opendrs${note}${await enableMerge(a)}.`, eligibleSince: since };
}

/** Best-effort: ask the suggested reviewers (GitHub logins only) to review after merge, and label the PR. */
async function requestDeferredReview({ client, io, pr, result }: ApprovalInput): Promise<string> {
  const logins = result.policy.suggestedReviewers.map(noreplyLogin).filter((l): l is string => l !== undefined);
  await unlessForbidden(
    () => client.addLabels(pr.number, [REVIEW_AFTER_MERGE_LABEL]),
    (e) => io.warning(`Could not add the ${REVIEW_AFTER_MERGE_LABEL} label (${e.message}).`),
  );
  if (!logins.length) return "no GitHub login among the suggested reviewers, none requested";
  try {
    await client.requestReviewers(pr.number, logins);
    return `review requested from ${logins.join(", ")}`;
  } catch (e) {
    if (!(e instanceof GitHubError && (e.status === 403 || e.status === 422))) throw e;
    io.warning(`Could not request a review from ${logins.join(", ")} (${e.message}). Ask them by hand.`);
    return "requesting a review failed (see the job log)";
  }
}

async function enableMerge({ client, io, pr, result }: ApprovalInput): Promise<string> {
  const method = result.policy.mergeMethod;
  if (method === "none") return "";
  try {
    const settings = await client.mergeSettings(pr.base.ref);
    if (method === "queue" && settings.hasMergeQueue) {
      await client.enqueue(pr.node_id, pr.head.sha);
      return "; added to the merge queue";
    }
    if (method === "queue") io.notice(`No merge queue on ${pr.base.ref}: enabling auto-merge instead.`);
    await client.enableAutoMerge(pr.node_id, settings.method, pr.head.sha);
    return "; auto-merge enabled";
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    io.warning(`Approved, but enabling ${method === "queue" ? "the merge queue or auto-merge" : "auto-merge"} failed: ${e.message}. Check that auto-merge is allowed in the repository settings.`);
    return "; enabling auto-merge failed (see the job log)";
  }
}
