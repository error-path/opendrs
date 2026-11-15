import { z } from "zod";
import { OpendrsError } from "../domain/types.js";

// Both fork modes run on a `workflow_run` event: the base branch's workflow, started when a pull
// request's workflow run completes. Nothing the fork's run produced is read. The pull request is
// found again here from three facts GitHub itself records about that run (head commit, head
// repository, head branch) and the repository's own list of open pull requests.

const commitSha = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
const repositoryName = z.string().min(3).max(200);

/** The fields of the `workflow_run` payload the fork modes read. Other keys are ignored. */
const workflowRunEventSchema = z.object({
  workflow_run: z.object({
    event: z.string().max(100),
    head_sha: commitSha,
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
  base: z.object({ sha: commitSha, repo: z.object({ full_name: repositoryName }) }),
  head: z.object({ sha: commitSha, repo: z.object({ full_name: repositoryName }).nullable() }),
});

/** What GitHub recorded about the workflow run that just completed. */
export interface CompletedWorkflowRun {
  /** The event that started the completed run, such as `pull_request`. */
  triggeringEvent: string;
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
  listOpenPullsByHead(headOwner: string, headBranch: string): Promise<unknown[]>;
}

/** Compares two `owner/name` repository names as GitHub does: without regard to case. */
const sameRepository = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/**
 * Reads the completed workflow run from a `workflow_run` event payload.
 *
 * @param event - The parsed event payload (`GITHUB_EVENT_PATH`).
 * @param repository - The repository the job runs in (`GITHUB_REPOSITORY`), as `owner/name`.
 * @returns The run's triggering event, head commit, head branch and repositories.
 * @throws {@link OpendrsError} If the payload is not a `workflow_run` event, or is for another repository.
 */
export function readCompletedWorkflowRun(event: unknown, repository: string): CompletedWorkflowRun {
  const parsed = workflowRunEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new OpendrsError(
      "The score-only and fork-comment modes need a workflow_run event: this event has no usable workflow_run payload (event, head_sha, head_branch, head_repository)",
      "usage",
    );
  }
  const { workflow_run: workflowRun, repository: eventRepository } = parsed.data;
  if (!sameRepository(eventRepository.full_name, repository)) {
    throw new OpendrsError("The workflow_run event is for another repository than GITHUB_REPOSITORY: refusing to continue", "usage");
  }
  return {
    triggeringEvent: workflowRun.event,
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
 * @param client - Lists this repository's open pull requests.
 * @param completedRun - The run from the event payload.
 * @returns The pull request, or a fixed reason why there is none to act on.
 */
export async function findForkPullRequest(client: PullLister, completedRun: CompletedWorkflowRun): Promise<ForkPullRequest | { skipReason: string }> {
  if (completedRun.triggeringEvent !== "pull_request") return { skipReason: "the completed workflow run was not started by a pull_request event" };
  if (sameRepository(completedRun.headRepository, completedRun.baseRepository)) {
    return { skipReason: "the pull request is not from a fork; the pull_request workflow comments on it itself" };
  }
  const listedPulls = await client.listOpenPullsByHead(completedRun.headOwner, completedRun.headBranch);
  const matchingPulls = listedPulls.flatMap((listedPull) => {
    const parsed = openPullSchema.safeParse(listedPull);
    if (!parsed.success) return [];
    const pull = parsed.data;
    const isTheRunsPull =
      pull.head.sha === completedRun.headSha &&
      pull.head.repo !== null &&
      sameRepository(pull.head.repo.full_name, completedRun.headRepository) &&
      sameRepository(pull.base.repo.full_name, completedRun.baseRepository);
    return isTheRunsPull ? [pull] : [];
  });
  if (matchingPulls.length !== 1) {
    return {
      skipReason:
        matchingPulls.length === 0
          ? "no open pull request has the run's head commit (it was closed, or its head moved; a newer run handles the new head)"
          : "more than one open pull request has the run's head commit and branch, so none is chosen",
    };
  }
  const pull = matchingPulls[0]!;
  return {
    number: pull.number,
    headSha: pull.head.sha,
    baseSha: pull.base.sha,
    labels: pull.labels.map((label) => label.name),
    author: pull.user ? { login: pull.user.login, type: pull.user.type } : undefined,
  };
}
