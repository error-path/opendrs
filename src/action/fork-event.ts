import { z } from "zod";
import { OpendrsError } from "../domain/types.js";
import { commitShaSchema, describeSchemaIssues } from "../domain/untrusted.js";
import { MAX_PULL_LISTING_PAGES } from "./fork-limits.js";

// The fork modes run on a `workflow_run` event: the default branch's workflow, started when a pull
// request's workflow run completes. Nothing the fork's run produced is read. The pull request is
// found again here from facts GitHub itself records about that run (head commit, head repository,
// head branch, conclusion) and the repository's own list of open pull requests.

const repositoryName = z.string().min(3).max(200);

/** The fields of the `workflow_run` payload the fork modes read. Other keys are ignored. */
const workflowRunEventSchema = z.object({
  workflow_run: z.object({
    event: z.string().max(100),
    conclusion: z.string().max(100).nullish(),
    head_sha: commitShaSchema,
    // A fork chooses its branch name: it is only compared, and sent to GitHub URL-encoded.
    head_branch: z.string().min(1).max(1024),
    head_repository: z.object({ full_name: repositoryName, owner: z.object({ login: z.string().min(1).max(100) }) }),
  }),
  repository: z.object({ full_name: repositoryName }),
});

/** An open pull request as `GET /pulls` lists it; only the fields used to match and to comment. */
const openPullSchema = z.object({
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  labels: z.array(z.object({ name: z.string() })).default([]),
  user: z.object({ login: z.string(), type: z.string().optional() }).nullish(),
  base: z.object({ sha: commitShaSchema, repo: z.object({ full_name: repositoryName }) }),
  head: z.object({ sha: commitShaSchema, repo: z.object({ full_name: repositoryName }).nullable() }),
});

/**
 * The conclusions of a run that ran to its end. A fork's run that waits for a maintainer's approval
 * completes with `action_required`, and a superseded one with `cancelled`: neither is acted on.
 */
const FINISHED_CONCLUSIONS = new Set(["success", "failure"]);

/** What GitHub recorded about the workflow run that just completed. */
export interface CompletedWorkflowRun {
  /** The event that started the completed run, such as `pull_request`. */
  triggeringEvent: string;
  /** How the run ended, such as `success` or `action_required`; undefined when GitHub sent none. */
  conclusion?: string;
  headSha: string;
  headBranch: string;
  /** The head repository as `owner/name`. */
  headRepository: string;
  headOwner: string;
  /** The repository the event was delivered to, as `owner/name`. */
  baseRepository: string;
}

/** A fork's open pull request, found from the repository's own data. */
export interface ForkPullRequest {
  number: number;
  headSha: string;
  /** The base branch's commit when GitHub last updated the pull request. */
  baseSha: string;
  labels: string[];
  /** The account that opened it; `type` is "Bot" for a GitHub App. */
  author?: { login: string; type?: string };
}

/** The part of the GitHub client that finding the pull request needs. */
export interface PullLister {
  listOpenPullsByHead(headOwner: string, headBranch: string, maxPages: number): Promise<{ entries: unknown[]; isComplete: boolean }>;
}

/** Compares two `owner/name` repository names as GitHub does: without regard to case. */
const isSameRepository = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/**
 * Reads the completed workflow run from a `workflow_run` event payload.
 *
 * @param event - The parsed event payload (`GITHUB_EVENT_PATH`).
 * @param repository - The repository the job runs in (`GITHUB_REPOSITORY`), as `owner/name`.
 * @returns The run's triggering event, conclusion, head commit, head branch and repositories.
 * @throws {@link OpendrsError} If the payload is not a `workflow_run` event, or is for another repository.
 */
export function readCompletedWorkflowRun(event: unknown, repository: string): CompletedWorkflowRun {
  const parsed = workflowRunEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new OpendrsError(
      "The score-only, fork-comment and fork-failure modes need a workflow_run event: this event has no usable workflow_run payload (event, head_sha, head_branch, head_repository)",
      "usage",
    );
  }
  const { workflow_run: workflowRun, repository: eventRepository } = parsed.data;
  if (!isSameRepository(eventRepository.full_name, repository)) {
    throw new OpendrsError("The workflow_run event is for another repository than GITHUB_REPOSITORY: refusing to continue", "usage");
  }
  return {
    triggeringEvent: workflowRun.event,
    conclusion: workflowRun.conclusion ?? undefined,
    headSha: workflowRun.head_sha,
    headBranch: workflowRun.head_branch,
    headRepository: workflowRun.head_repository.full_name,
    headOwner: workflowRun.head_repository.owner.login,
    baseRepository: repository,
  };
}

/**
 * Finds the one open fork pull request that the completed workflow run belongs to.
 *
 * For a fork, GitHub leaves the run's own `pull_requests` list empty, and anything the run wrote
 * (outputs, artifacts) is under the fork's control. So the pull request is looked up in this
 * repository's open pull requests by head owner and branch, and accepted only when exactly one has
 * the run's head commit, the run's head repository, and this repository as its base.
 *
 * A run that did not finish (waiting for approval, cancelled, skipped) is not acted on at all.
 *
 * @param client - Lists this repository's open pull requests.
 * @param completedRun - The run from the event payload.
 * @param warn - Receives one message for each listed entry that is not a usable pull request. The message names fields only.
 * @returns The pull request, or a fixed reason why there is none to act on.
 */
export async function findForkPullRequest(
  client: PullLister,
  completedRun: CompletedWorkflowRun,
  warn: (message: string) => void,
): Promise<ForkPullRequest | { skipReason: string }> {
  if (completedRun.triggeringEvent !== "pull_request") return { skipReason: "the completed workflow run was not started by a pull_request event" };
  if (completedRun.conclusion === undefined || !FINISHED_CONCLUSIONS.has(completedRun.conclusion)) {
    return { skipReason: "the completed workflow run did not finish with success or failure (it is waiting for approval, or was cancelled or skipped)" };
  }
  if (isSameRepository(completedRun.headRepository, completedRun.baseRepository)) {
    return { skipReason: "the pull request is not from a fork; the pull_request workflow comments on it itself" };
  }

  const listing = await client.listOpenPullsByHead(completedRun.headOwner, completedRun.headBranch, MAX_PULL_LISTING_PAGES);
  let rejectedEntries = 0;
  const matchingPulls = listing.entries.flatMap((listedPull) => {
    const parsed = openPullSchema.safeParse(listedPull);
    if (!parsed.success) {
      rejectedEntries++;
      warn(`GitHub listed an entry that is not a usable pull request (${describeSchemaIssues(parsed.error.issues)}); it is ignored.`);
      return [];
    }
    const pull = parsed.data;
    const isTheRunsPull =
      pull.head.sha === completedRun.headSha &&
      pull.head.repo !== null &&
      isSameRepository(pull.head.repo.full_name, completedRun.headRepository) &&
      isSameRepository(pull.base.repo.full_name, completedRun.baseRepository);
    return isTheRunsPull ? [pull] : [];
  });

  if (matchingPulls.length > 1) return { skipReason: "more than one open pull request has the run's head commit and branch, so none is chosen" };
  const pull = matchingPulls[0];
  if (pull === undefined) {
    const listed = listing.entries.length;
    if (!listing.isComplete) return { skipReason: `none of the first ${listed} open pull requests GitHub listed for the run's branch matches, and the list goes on` };
    if (listed === 0) return { skipReason: "GitHub lists no open pull request for the run's head owner and branch (it was closed or merged)" };
    if (rejectedEntries === listed) return { skipReason: `GitHub listed ${listed} entries for the run's branch, and none is a usable pull request (see the warnings above)` };
    return {
      skipReason: `no open pull request among the ${listed} listed for the run's branch has the run's head commit and head repository (its head moved, so a newer run handles it)`,
    };
  }
  return {
    number: pull.number,
    headSha: pull.head.sha,
    baseSha: pull.base.sha,
    labels: pull.labels.map((label) => label.name),
    author: pull.user ? { login: pull.user.login, type: pull.user.type } : undefined,
  };
}
