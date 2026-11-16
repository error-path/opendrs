import { z } from "zod";
import { OpendrsError } from "../domain/types.js";
import { commitShaSchema, describeSchemaIssues } from "../domain/untrusted.js";
import { scoreDiff } from "../engine.js";
import { DEFAULT_WEIGHTS } from "../model/defaults.js";
import { renderForkComment } from "../report/fork-comment.js";
import { buildForkResult, buildTooLargeResult, serializeForkResult, type ForkResult, type TooLargeReason } from "../report/fork-result.js";
import { VERSION } from "../version.js";
import { logBaseConfigSource, readBaseConfig, readBaseModel, requireCommit } from "./base-settings.js";
import { restrictClient } from "./fork-client.js";
import { buildChangedFiles, countPatchBytes, parsePullRequestFiles, readHeadContents } from "./fork-diff.js";
import { findForkPullRequest, readCompletedWorkflowRun, type ForkPullRequest } from "./fork-event.js";
import { FORK_SCORE_LIMITS, type ForkScoreLimits } from "./fork-limits.js";
import type { GitHubClient } from "./github.js";
import type { WorkflowIO } from "./workflow.js";

export { FORK_SCORE_LIMITS } from "./fork-limits.js";

/** The only GitHub calls score-only mode can make. All of them read. */
export const FORK_SCORE_CLIENT_METHODS = ["listOpenPullRequestsByHeadBranch", "readPullRequest", "compareBaseAndHeadCommits", "listPullRequestFiles", "readBlobContent"] as const;

/** A GitHub client that can only read what score-only mode needs. */
export type ForkScoreClient = Readonly<Pick<GitHubClient, (typeof FORK_SCORE_CLIENT_METHODS)[number]>>;

/**
 * Narrows a GitHub client to the read calls of score-only mode.
 *
 * @param client - The full client.
 * @returns A client with only {@link FORK_SCORE_CLIENT_METHODS}.
 */
export function restrictToForkScore(client: GitHubClient): ForkScoreClient {
  return restrictClient(client, FORK_SCORE_CLIENT_METHODS);
}

/** What score-only mode needs from the Action's environment. */
export interface ScoreOnlyDependencies {
  /** The checkout of the base repository. The fork's commits are never in it. */
  repoDir: string;
  /** The parsed `workflow_run` event payload. */
  event: unknown;
  /** The repository the job runs in, as `owner/name`. */
  repository: string;
  client: ForkScoreClient;
  io: WorkflowIO;
}

/** The fields of `GET /pulls/{number}` read around the file listing. */
const pullRequestSummarySchema = z.object({
  head: z.object({ sha: commitShaSchema }),
  changed_files: z.number().int().min(0),
  commits: z.number().int().min(0),
  // Changes on every push, base change and edit: the same value before and after the listing
  // means the listing is of one state of the pull request.
  updated_at: z.string().min(1).max(64),
});
type PullRequestSummary = z.infer<typeof pullRequestSummarySchema>;

const comparisonSchema = z.object({ merge_base_commit: z.object({ sha: commitShaSchema }) });

/**
 * Reads the pull request's head commit, size and last update.
 *
 * @param client - Reads the pull request.
 * @param pullNumber - The pull request number.
 * @returns The validated fields.
 * @throws {@link OpendrsError} If GitHub's answer lacks any of them. The message names fields only.
 */
async function readPullRequestSummary(client: ForkScoreClient, pullNumber: number): Promise<PullRequestSummary> {
  const summary = pullRequestSummarySchema.safeParse(await client.readPullRequest(pullNumber));
  if (!summary.success) {
    throw new OpendrsError(`GitHub returned a pull request without a usable head.sha, changed_files, commits or updated_at (${describeSchemaIssues(summary.error.issues)})`, "io");
  }
  return summary.data;
}

/** The outcome of listing a pull request's files at one state of it. */
type FileListing =
  | { kind: "listed"; listedFiles: unknown[]; summary: PullRequestSummary }
  | { kind: "head-moved" }
  | { kind: "too-large"; reason: TooLargeReason; limit: number };

/**
 * Lists a pull request's changed files, and makes sure the listing belongs to the run's head commit.
 *
 * GitHub's files endpoint lists the pull request as it is now, not a commit named by hash, and its
 * compare endpoint, which does take hashes, returns at most 300 files. So the pull request is read
 * before and after the listing, and the listing counts only when both reads show the run's head
 * commit and the same `updated_at`. When only `updated_at` changed (an edit, a new base), the files
 * are listed again, at most `maxListingAttempts` times in all.
 *
 * @param client - Reads the pull request and its files.
 * @param pullRequest - The pull request found for the completed run.
 * @param limits - The caps on files and listing attempts.
 * @param io - The workflow log.
 * @returns The listing with the pull request's state, or why there is none.
 * @throws {@link OpendrsError} If the pull request changed during every attempt.
 */
async function listFilesAtHead(client: ForkScoreClient, pullRequest: ForkPullRequest, limits: ForkScoreLimits, io: WorkflowIO): Promise<FileListing> {
  for (let attempt = 1; attempt <= limits.maxListingAttempts; attempt++) {
    const summaryBeforeListing = await readPullRequestSummary(client, pullRequest.number);
    if (summaryBeforeListing.head.sha !== pullRequest.headSha) return { kind: "head-moved" };
    if (summaryBeforeListing.changed_files > limits.maxChangedFiles) return { kind: "too-large", reason: "files", limit: limits.maxChangedFiles };
    const listedFiles = await client.listPullRequestFiles(pullRequest.number, limits.maxChangedFiles);
    const summaryAfterListing = await readPullRequestSummary(client, pullRequest.number);
    if (summaryAfterListing.head.sha !== pullRequest.headSha) return { kind: "head-moved" };
    if (summaryAfterListing.updated_at === summaryBeforeListing.updated_at) return { kind: "listed", listedFiles, summary: summaryAfterListing };
    io.info("The pull request changed while opendrs listed its files: listing them again.");
  }
  throw new OpendrsError(
    `The pull request changed during each of ${limits.maxListingAttempts} listings of its files, so no listing can be tied to the run's head commit. Re-run the job.`,
    "io",
  );
}

/**
 * Scores one fork pull request from API data, or reports which limit it is over.
 *
 * @param dependencies - The checkout, client and log.
 * @param pullRequest - The pull request found for the completed run.
 * @param limits - The caps on what is read.
 * @returns The result, or undefined when the pull request's head moved while it was being read.
 */
async function scoreForkPullRequest(dependencies: ScoreOnlyDependencies, pullRequest: ForkPullRequest, limits: ForkScoreLimits): Promise<ForkResult | undefined> {
  const { client, io, repoDir } = dependencies;
  const tooLarge = (reason: TooLargeReason, limit: number) => buildTooLargeResult(pullRequest.headSha, reason, limit, VERSION);

  const listing = await listFilesAtHead(client, pullRequest, limits, io);
  if (listing.kind === "head-moved") {
    io.notice("The pull request's head moved while opendrs read its files: nothing is scored. The run for the new head scores it.");
    return undefined;
  }
  if (listing.kind === "too-large") return tooLarge(listing.reason, listing.limit);
  const { listedFiles, summary } = listing;
  if (listedFiles.length > limits.maxChangedFiles) return tooLarge("files", limits.maxChangedFiles);
  const parsedListing = parsePullRequestFiles(listedFiles);
  if ("issues" in parsedListing) {
    io.warning(`GitHub listed a changed file that opendrs cannot read (${parsedListing.issues}): the pull request is not scored.`);
    return tooLarge("unreadable", 0);
  }
  const pullRequestFiles = parsedListing.files;
  if (summary.changed_files !== pullRequestFiles.length) return tooLarge("incomplete", 0);
  if (summary.commits > limits.maxCommits) return tooLarge("commits", limits.maxCommits);
  if (countPatchBytes(pullRequestFiles) > limits.maxPatchBytes) return tooLarge("bytes", limits.maxPatchBytes);

  await requireCommit(repoDir, pullRequest.baseSha, "Base");
  const { config, model } = await io.group("Configuration", async () => {
    const { config: baseConfig, hasConfigFile } = await readBaseConfig(repoDir, pullRequest.baseSha);
    logBaseConfigSource(io, pullRequest.baseSha, hasConfigFile);
    return { config: baseConfig, model: await readBaseModel(repoDir, pullRequest.baseSha, baseConfig, io) };
  });
  const comparison = comparisonSchema.safeParse(await client.compareBaseAndHeadCommits(pullRequest.baseSha, pullRequest.headSha));
  if (!comparison.success) {
    throw new OpendrsError(`GitHub's comparison of the base and head commits has no usable merge_base_commit (${describeSchemaIssues(comparison.error.issues)})`, "io");
  }
  const mergeBaseSha = comparison.data.merge_base_commit.sha;
  await requireCommit(repoDir, mergeBaseSha, "Merge-base");

  const changedFiles = buildChangedFiles(pullRequestFiles, config.paths.ignore);
  const unreadableFileCount = changedFiles.filter((changedFile) => changedFile.hasUnreadablePatch && !changedFile.ignored).length;
  if (unreadableFileCount > 0) {
    io.info(`GitHub sent no readable patch for ${unreadableFileCount} changed file(s): their lines count by GitHub's numbers, and the signals that read changed lines count as unknown.`);
  }
  const headContents = await readHeadContents(changedFiles, pullRequestFiles, client.readBlobContent, limits);
  if (headContents.gap?.kind === "failure") io.warning(`Changed code files could not be read at the head commit (${headContents.gap.detail}): complexity.touched counts as unknown.`);
  if (headContents.gap?.kind === "cap") io.info(`Changed code files were not read at the head commit (${headContents.gap.detail}): complexity.touched counts as unknown.`);

  try {
    const scoreResult = await scoreDiff({
      repoDir,
      base: pullRequest.baseSha,
      head: pullRequest.headSha,
      config,
      // Only the base commit's model counts. Without a valid one, the built-in weights: never a
      // model file from the working tree, which is the default branch and not the base commit.
      model: model ?? DEFAULT_WEIGHTS,
      modelKind: model === undefined ? "default" : "calibrated",
      diff: { base: mergeBaseSha, head: pullRequest.headSha, files: changedFiles },
      readHead: headContents.readHead,
      // The commits are not fetched, so the source is classified from the account type alone.
      pullRequestCommits: [],
      // No LLM judge and no brief: this job holds no secret and sends the fork's code nowhere.
      llm: null,
      // Nothing here ties the commits' author to the account, so expertise counts as unknown.
      authorVerified: false,
      account: pullRequest.author,
    });
    return buildForkResult(scoreResult);
  } catch (error) {
    // A git command over the base history that ran into its time limit: the job reports that, not a hang or a failure.
    if (error instanceof OpendrsError && error.code === "git" && /timed out after/.test(error.message)) return tooLarge("time", 0);
    throw error;
  }
}

/**
 * Runs the Action's score-only mode: score a fork's pull request without its code and without write access.
 *
 * The mode reads the diff and the changed code files through GitHub's API as data, and the history
 * from the base checkout. It never fetches or checks out the fork's commits, never calls the LLM
 * judge, and can only make the read calls in {@link FORK_SCORE_CLIENT_METHODS}. It sets the
 * `result` output to a compact JSON result for the commenting job, and leaves it unset when there
 * is no fork pull request to score.
 *
 * @param dependencies - The base checkout, event payload, read-only client and log.
 * @param limits - The caps on what is read; the defaults unless a test passes its own.
 * @returns The result that was written to the `result` output, or undefined when there was nothing to score.
 * @throws {@link OpendrsError} If the event is not a `workflow_run`, the base history needed is not in the checkout, or GitHub's answers are not usable.
 */
export async function runScoreOnly(dependencies: ScoreOnlyDependencies, limits: ForkScoreLimits = FORK_SCORE_LIMITS): Promise<ForkResult | undefined> {
  const { io } = dependencies;
  const completedRun = readCompletedWorkflowRun(dependencies.event, dependencies.repository);
  const pullRequest = await findForkPullRequest(dependencies.client, completedRun, (message) => io.warning(message));
  if ("skipReason" in pullRequest) {
    io.notice(`opendrs did not score anything: ${pullRequest.skipReason}.`);
    return undefined;
  }
  const result = await io.group("Score", () => scoreForkPullRequest(dependencies, pullRequest, limits));
  if (result === undefined) return undefined;

  io.info(result.status === "scored" ? `score ${result.score.toFixed(3)}, tier ${result.tier}` : `not scored: ${result.reason}`);
  io.setOutput("result", serializeForkResult(result));
  io.setOutput("score", result.status === "scored" ? result.score.toFixed(4) : "");
  io.setOutput("tier", result.status === "scored" ? result.tier : "");
  io.summary(renderForkComment(result));
  return result;
}
