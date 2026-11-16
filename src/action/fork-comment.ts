import { OpendrsError } from "../domain/types.js";
import { FORK_COMMENT_MARKER, renderForkComment, renderForkFailureComment } from "../report/fork-comment.js";
import { parseForkResult } from "../report/fork-result.js";
import { restrictClient } from "./fork-client.js";
import { findForkPullRequest, readCompletedWorkflowRun, type ForkPullRequest } from "./fork-event.js";
import { MAX_COMMENT_PAGES } from "./fork-limits.js";
import { GitHubError, sameLogin, type GitHubClient, type IssueComment } from "./github.js";
import type { WorkflowIO } from "./workflow.js";

// The Action's fork-comment and fork-failure modes: the only jobs in the fork workflow with a write
// token. fork-comment gets the scoring job's result as text, trusts none of it until it has passed
// the schema, finds the pull request again by itself, and then can do exactly two things: upsert
// its own comment and set a risk label. fork-failure, run when the scoring job failed, replaces
// that comment with a fixed "not scored" text and removes the risk label. This file imports
// nothing that approves, reviews or merges.

/** The only GitHub calls the fork-comment and fork-failure modes can make: find the pull request, comment, label. */
export const FORK_COMMENT_CLIENT_METHODS = ["viewerLogin", "listOpenPullsByHead", "listCommentsUpTo", "createComment", "updateComment", "addLabels", "removeLabel"] as const;

/** A GitHub client that can only comment and label. */
export type ForkCommentClient = Readonly<Pick<GitHubClient, (typeof FORK_COMMENT_CLIENT_METHODS)[number]>>;

/** The labels these modes set or remove. They touch no other label. */
const RISK_LABELS = ["risk:green", "risk:yellow", "risk:red"];

/** The account GITHUB_TOKEN writes comments as. */
const GITHUB_ACTIONS_BOT = "github-actions[bot]";

const COMMENT_PERMISSION_HINT = "The commenting job needs `pull-requests: write`.";
const LABEL_PERMISSION_HINT = "The commenting job needs `pull-requests: write`, and `issues: write` to create a label that does not exist yet.";

/**
 * Narrows a GitHub client to the calls of the fork-comment and fork-failure modes.
 *
 * @param client - The full client.
 * @returns A client with only {@link FORK_COMMENT_CLIENT_METHODS}.
 */
export function restrictToForkComment(client: GitHubClient): ForkCommentClient {
  return restrictClient(client, FORK_COMMENT_CLIENT_METHODS);
}

/** What fork-comment mode needs from the Action's environment. */
export interface ForkCommentDeps {
  /** The parsed `workflow_run` event payload. */
  event: unknown;
  /** The repository the job runs in, as `owner/name`. */
  repository: string;
  /** The scoring job's `result` output, exactly as received. Treated as hostile. */
  result: string;
  shouldComment: boolean;
  shouldLabel: boolean;
  client: ForkCommentClient;
  io: WorkflowIO;
}

/** What fork-failure mode needs from the Action's environment: no result, as the scoring job wrote none. */
export type ForkFailureDeps = Omit<ForkCommentDeps, "result">;

/**
 * Runs one write to GitHub, and fails with GitHub's own message when it is refused.
 *
 * Nothing is swallowed: a comment or label that could not be written fails the job, so a stale
 * score is never left looking current. A 403 also says which permission the job needs.
 *
 * @param write - The calls to make.
 * @param permissionHint - What to add to the message on a 403.
 * @throws {@link OpendrsError} On a 403, with GitHub's message and the hint; any other error as it was thrown.
 */
async function writeOrFail(write: () => Promise<void>, permissionHint: string): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (error instanceof GitHubError && error.status === 403) throw new OpendrsError(`${error.message}. ${permissionHint}`, "io");
    throw error;
  }
}

/**
 * Tells whether a comment is this mode's own fork comment.
 *
 * It must start with the fork marker and be written by this token's account. When the account is
 * not known, only `github-actions[bot]` counts, the account GITHUB_TOKEN writes as: another bot's
 * copy of the marker is never edited.
 *
 * @param comment - A comment on the pull request.
 * @param viewer - The token's login, or undefined when GitHub did not say.
 * @returns True for a comment this mode may update.
 */
function isOwnForkComment(comment: IssueComment, viewer: string | undefined): boolean {
  if (!(comment.body ?? "").startsWith(FORK_COMMENT_MARKER) || comment.user === null) return false;
  return viewer === undefined ? comment.user.login === GITHUB_ACTIONS_BOT : sameLogin(comment.user.login, viewer);
}

/**
 * Writes the fork comment: updates the newest one this mode wrote, or adds one.
 *
 * At most {@link MAX_COMMENT_PAGES} pages of comments are read, oldest first. When its comment is
 * not among them and there are more, the job fails instead of adding a second comment on every run.
 *
 * @param client - Lists, creates and updates comments.
 * @param pullNumber - The pull request number.
 * @param body - The comment body.
 * @throws {@link OpendrsError} If the comments run past the page limit without opendrs's comment, or GitHub refuses the write.
 */
async function upsertForkComment(client: ForkCommentClient, pullNumber: number, body: string): Promise<void> {
  await writeOrFail(async () => {
    const viewer = await client.viewerLogin();
    const { comments, isComplete } = await client.listCommentsUpTo(pullNumber, MAX_COMMENT_PAGES);
    // GitHub lists oldest first, so the last match is the newest.
    const ownComment = comments.filter((comment) => isOwnForkComment(comment, viewer)).at(-1);
    if (ownComment) return void (await client.updateComment(ownComment.id, body));
    if (!isComplete) {
      throw new OpendrsError(
        `The pull request has more than ${MAX_COMMENT_PAGES * 100} comments and opendrs's comment is not among the first ${MAX_COMMENT_PAGES * 100}: refusing to add another one`,
        "io",
      );
    }
    await client.createComment(pullNumber, body);
  }, COMMENT_PERMISSION_HINT);
}

/**
 * Makes the pull request's risk labels match the result: the wanted one, and no other `risk:*` label.
 *
 * Only the changes are made, so a run that finds the labels already right makes no call.
 *
 * @param client - Adds and removes labels.
 * @param pullRequest - The pull request, with the labels it had when listed.
 * @param wantedLabel - The one risk label it should have, or undefined for none.
 * @throws {@link OpendrsError} If GitHub refuses a change. Removing a label the pull request no longer has is not an error.
 */
async function reconcileRiskLabels(client: ForkCommentClient, pullRequest: ForkPullRequest, wantedLabel: string | undefined): Promise<void> {
  await writeOrFail(async () => {
    for (const label of new Set(pullRequest.labels)) {
      if (RISK_LABELS.includes(label) && label !== wantedLabel) await client.removeLabel(pullRequest.number, label);
    }
    if (wantedLabel !== undefined && !pullRequest.labels.includes(wantedLabel)) await client.addLabels(pullRequest.number, [wantedLabel]);
  }, LABEL_PERMISSION_HINT);
}

/**
 * Runs the Action's fork-comment mode: post a fork pull request's score as a comment and a label.
 *
 * Before any GitHub call, the result must pass `parseForkResult` and name the head commit of the
 * completed workflow run in the event. The pull request's number, commit and repository then come
 * from this job's own lookup, never from the result. The comment is rendered from a fixed template
 * and the validated fields only.
 *
 * @param deps - The event payload, the result text, the restricted client and the log.
 * @throws {@link OpendrsError} If the event is not a `workflow_run`, the result is invalid or for another commit, or GitHub refuses the comment or a label.
 */
export async function runForkComment(deps: ForkCommentDeps): Promise<void> {
  const { client, io } = deps;
  const completedRun = readCompletedWorkflowRun(deps.event, deps.repository);
  const result = parseForkResult(deps.result);
  if (result.head !== completedRun.headSha) {
    throw new OpendrsError("The result was scored for a different commit than the workflow run's head commit: refusing to comment", "usage");
  }

  const pullRequest = await findForkPullRequest(client, completedRun, (message) => io.warning(message));
  if ("skipReason" in pullRequest) {
    io.notice(`opendrs did not comment: ${pullRequest.skipReason}.`);
    return;
  }

  const body = renderForkComment(result);
  if (deps.shouldComment) await upsertForkComment(client, pullRequest.number, body);
  if (deps.shouldLabel) {
    // A pull request that was not scored gets no risk label, and loses a stale one.
    const scoredLabel = result.status === "scored" ? `risk:${result.tier}` : undefined;
    await reconcileRiskLabels(client, pullRequest, scoredLabel !== undefined && RISK_LABELS.includes(scoredLabel) ? scoredLabel : undefined);
  }

  io.setOutput("score", result.status === "scored" ? result.score.toFixed(4) : "");
  io.setOutput("tier", result.status === "scored" ? result.tier : "");
  io.summary(body);
}

/**
 * Runs the Action's fork-failure mode: say on a fork pull request that its scoring job failed.
 *
 * It finds the pull request itself, as fork-comment mode does, replaces the fork comment with a
 * fixed "not scored" text for the run's head commit, and removes every `risk:*` label, so an older
 * score never stays on the pull request looking current. It reads no output of the scoring job.
 *
 * @param deps - The event payload, the restricted client and the log.
 * @throws {@link OpendrsError} If the event is not a `workflow_run`, or GitHub refuses the comment or a label.
 */
export async function runForkFailure(deps: ForkFailureDeps): Promise<void> {
  const { client, io } = deps;
  const completedRun = readCompletedWorkflowRun(deps.event, deps.repository);
  const pullRequest = await findForkPullRequest(client, completedRun, (message) => io.warning(message));
  if ("skipReason" in pullRequest) {
    io.notice(`opendrs did not comment: ${pullRequest.skipReason}.`);
    return;
  }
  const body = renderForkFailureComment(completedRun.headSha);
  if (deps.shouldComment) await upsertForkComment(client, pullRequest.number, body);
  if (deps.shouldLabel) await reconcileRiskLabels(client, pullRequest, undefined);
  io.summary(body);
}
