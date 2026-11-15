import { OpendrsError } from "../domain/types.js";
import { FORK_COMMENT_MARKER, renderForkComment } from "../report/fork-comment.js";
import { parseForkResult } from "../report/fork-result.js";
import { restrictClient } from "./fork-client.js";
import { findForkPullRequest, readCompletedWorkflowRun } from "./fork-event.js";
import { isSelf, unlessForbidden, type GitHubClient } from "./github.js";
import type { WorkflowIO } from "./workflow.js";

// The Action's fork-comment mode: the only job in the fork workflow with a write token. It gets the
// scoring job's result as text, trusts none of it until it has passed the schema, finds the pull
// request again by itself, and then can do exactly two things: upsert its own comment and set a
// risk label. This file imports nothing that approves, reviews or merges.

/** The only GitHub calls fork-comment mode can make: find the pull request, comment, label. */
export const FORK_COMMENT_CLIENT_METHODS = ["viewerLogin", "listOpenPullsByHead", "listComments", "createComment", "updateComment", "addLabels", "removeLabel"] as const;

/** A GitHub client that can only comment and label. */
export type ForkCommentClient = Readonly<Pick<GitHubClient, (typeof FORK_COMMENT_CLIENT_METHODS)[number]>>;

/** The labels this mode sets or removes. It touches no other label. */
const RISK_LABELS = ["risk:green", "risk:yellow", "risk:red"];

const COMMENT_FORBIDDEN = "Could not write the fork comment (403): the commenting job needs `pull-requests: write`.";
const LABEL_FORBIDDEN = "Could not set the risk label (403): the commenting job needs `pull-requests: write`, and `issues: write` to create a label that does not exist yet.";

/**
 * Narrows a GitHub client to the calls of fork-comment mode.
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

/**
 * Runs the Action's fork-comment mode: post a fork pull request's score as a comment and a label.
 *
 * Before any GitHub call, the result must pass `parseForkResult` and name the head commit of the
 * completed workflow run in the event. The pull request's number, commit and repository then come
 * from this job's own lookup, never from the result. The comment is rendered from a fixed template
 * and the validated fields only.
 *
 * @param deps - The event payload, the result text, the restricted client and the log.
 * @throws {@link OpendrsError} If the event is not a `workflow_run`, the result is invalid, or it was scored for another commit.
 */
export async function runForkComment(deps: ForkCommentDeps): Promise<void> {
  const { client, io } = deps;
  const completedRun = readCompletedWorkflowRun(deps.event, deps.repository);
  const result = parseForkResult(deps.result);
  if (result.head !== completedRun.headSha) {
    throw new OpendrsError("The result was scored for a different commit than the workflow run's head commit: refusing to comment", "usage");
  }

  const pullRequest = await findForkPullRequest(client, completedRun);
  if ("skipReason" in pullRequest) {
    io.notice(`opendrs did not comment: ${pullRequest.skipReason}.`);
    return;
  }

  const body = renderForkComment(result);
  if (deps.shouldComment) {
    await unlessForbidden(
      async () => {
        const viewer = await client.viewerLogin();
        const comments = await client.listComments(pullRequest.number);
        // Its own comment only: written by this token's account and starting with the fork marker. The newest one, as GitHub lists oldest first.
        const ownComment = comments.filter((comment) => isSelf(comment.user, viewer) && (comment.body ?? "").startsWith(FORK_COMMENT_MARKER)).at(-1);
        if (ownComment) await client.updateComment(ownComment.id, body);
        else await client.createComment(pullRequest.number, body);
      },
      () => io.warning(COMMENT_FORBIDDEN),
    );
  }

  if (deps.shouldLabel) {
    // A pull request that was not scored gets no risk label, and loses a stale one.
    const scoredLabel = result.status === "scored" ? `risk:${result.tier}` : undefined;
    const wantedLabel = scoredLabel !== undefined && RISK_LABELS.includes(scoredLabel) ? scoredLabel : undefined;
    await unlessForbidden(
      async () => {
        for (const label of pullRequest.labels) {
          if (RISK_LABELS.includes(label) && label !== wantedLabel) await client.removeLabel(pullRequest.number, label);
        }
        if (wantedLabel !== undefined && !pullRequest.labels.includes(wantedLabel)) await client.addLabels(pullRequest.number, [wantedLabel]);
      },
      () => io.warning(LABEL_FORBIDDEN),
    );
  }

  io.setOutput("score", result.status === "scored" ? result.score.toFixed(4) : "");
  io.setOutput("tier", result.status === "scored" ? result.tier : "");
  io.summary(body);
}
