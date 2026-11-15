import { z } from "zod";
import { CONFIG_FILE, defaultConfig, parseConfigText, type OpendrsConfig } from "../domain/config.js";
import type { ModelWeights } from "../domain/types.js";
import { OpendrsError } from "../domain/types.js";
import { scoreDiff } from "../engine.js";
import { gitMaybe } from "../git/exec.js";
import { renderForkComment } from "../report/fork-comment.js";
import { buildForkResult, buildTooLargeResult, serializeForkResult, type ForkResult, type TooLargeReason } from "../report/fork-result.js";
import { VERSION } from "../version.js";
import { restrictClient } from "./fork-client.js";
import { buildChangedFiles, countPatchBytes, parsePullFiles, readHeadContents } from "./fork-diff.js";
import { findForkPullRequest, readCompletedWorkflowRun } from "./fork-event.js";
import { FORK_SCORE_LIMITS, type ForkScoreLimits } from "./fork-limits.js";
import type { GitHubClient } from "./github.js";
import type { WorkflowIO } from "./workflow.js";

export { FORK_SCORE_LIMITS } from "./fork-limits.js";

/** The only GitHub calls score-only mode can make. All of them read. */
export const FORK_SCORE_CLIENT_METHODS = ["listOpenPullsByHead", "readPull", "compareCommits", "listPullFiles", "readBlob"] as const;

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
export interface ScoreOnlyDeps {
  /** The checkout of the base repository. The fork's commits are never in it. */
  repoDir: string;
  /** The parsed `workflow_run` event payload. */
  event: unknown;
  /** The repository the job runs in, as `owner/name`. */
  repository: string;
  client: ForkScoreClient;
  io: WorkflowIO;
}

const commitSha = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);
/** The fields of `GET /pulls/{number}` read after listing the files. */
const pullSummarySchema = z.object({
  head: z.object({ sha: commitSha }),
  changed_files: z.number().int().min(0),
  commits: z.number().int().min(0),
});
const comparisonSchema = z.object({ merge_base_commit: z.object({ sha: commitSha }) });

/**
 * Checks that a commit is in the base checkout.
 *
 * @param repoDir - The checkout.
 * @param sha - The commit hash.
 * @param description - What the commit is, for the error message.
 * @throws {@link OpendrsError} If the commit is absent.
 */
async function requireBaseCommit(repoDir: string, sha: string, description: string): Promise<void> {
  if ((await gitMaybe(repoDir, ["cat-file", "-e", `${sha}^{commit}`])) === undefined) {
    throw new OpendrsError(
      `${description} commit ${sha} is not in the checkout. Check out the base repository with actions/checkout and fetch-depth: 0; if the base branch moved since the checkout, re-run the job.`,
      "git",
    );
  }
}

/**
 * Loads `.opendrs.yml` and the calibrated model from the base commit, never from the pull request.
 *
 * @param repoDir - The base checkout.
 * @param baseSha - The pull request's base commit.
 * @param io - Where notes about the configuration are logged.
 * @returns The config, and the model when the base commit has a valid one.
 */
async function loadBaseSettings(repoDir: string, baseSha: string, io: WorkflowIO): Promise<{ config: OpendrsConfig; model?: ModelWeights }> {
  const configText = await gitMaybe(repoDir, ["show", `${baseSha}:${CONFIG_FILE}`]);
  const config = configText === undefined ? defaultConfig() : parseConfigText(configText);
  io.info(configText === undefined ? `No ${CONFIG_FILE} on base commit ${baseSha}: using defaults.` : `Using ${CONFIG_FILE} from base commit ${baseSha}.`);
  const modelText = await gitMaybe(repoDir, ["show", `${baseSha}:${config.model}`]);
  if (modelText === undefined) return { config };
  try {
    const model = JSON.parse(modelText) as ModelWeights;
    if (model.version === 1 && typeof model.intercept === "number") return { config, model };
  } catch {
    // fall through to the warning
  }
  io.warning("The model file on the base commit is not a valid model; it is ignored.");
  return { config };
}

/**
 * Scores one fork pull request from API data, or reports which limit it is over.
 *
 * @param deps - The checkout, client and log.
 * @param pullRequest - The pull request found for the completed run.
 * @param limits - The caps on what is read.
 * @returns The result, or undefined when the pull request's head moved while it was being read.
 */
async function scoreForkPullRequest(
  deps: ScoreOnlyDeps,
  pullRequest: { number: number; headSha: string; baseSha: string; author?: { login: string; type?: string } },
  limits: ForkScoreLimits,
): Promise<ForkResult | undefined> {
  const { client, io, repoDir } = deps;
  const tooLarge = (reason: TooLargeReason, limit: number) => buildTooLargeResult(pullRequest.headSha, reason, limit, VERSION);

  const listedFiles = await client.listPullFiles(pullRequest.number, limits.maxChangedFiles);
  if (listedFiles.length > limits.maxChangedFiles) return tooLarge("files", limits.maxChangedFiles);
  const pullFiles = parsePullFiles(listedFiles);
  if (pullFiles === undefined) return tooLarge("incomplete", 0);

  // The files endpoint lists the pull request's current head, not a commit named by hash. Reading
  // the pull request afterwards shows whether that head is still the one this run is about.
  const summary = pullSummarySchema.safeParse(await client.readPull(pullRequest.number));
  if (!summary.success) throw new OpendrsError("GitHub returned a pull request without head.sha, changed_files or commits", "io");
  if (summary.data.head.sha !== pullRequest.headSha) {
    io.notice("The pull request's head moved while opendrs read its files: nothing is scored. The run for the new head scores it.");
    return undefined;
  }
  if (summary.data.changed_files > limits.maxChangedFiles) return tooLarge("files", limits.maxChangedFiles);
  if (summary.data.changed_files !== pullFiles.length) return tooLarge("incomplete", 0);
  if (summary.data.commits > limits.maxCommits) return tooLarge("commits", limits.maxCommits);
  if (countPatchBytes(pullFiles) > limits.maxPatchBytes) return tooLarge("bytes", limits.maxPatchBytes);

  await requireBaseCommit(repoDir, pullRequest.baseSha, "Base");
  const { config, model } = await io.group("Configuration", () => loadBaseSettings(repoDir, pullRequest.baseSha, io));
  const comparison = comparisonSchema.safeParse(await client.compareCommits(pullRequest.baseSha, pullRequest.headSha));
  if (!comparison.success) throw new OpendrsError("GitHub's comparison of the base and head commits has no merge_base_commit", "io");
  const mergeBaseSha = comparison.data.merge_base_commit.sha;
  await requireBaseCommit(repoDir, mergeBaseSha, "Merge-base");

  const changedFiles = buildChangedFiles(pullFiles, config.paths.ignore);
  const headContents = await readHeadContents(changedFiles, pullFiles, client.readBlob, limits);
  if (!headContents.isComplete) io.info("Not every changed code file could be read at the head commit within the caps: complexity.touched counts as unknown.");

  try {
    const scoreResult = await scoreDiff({
      repoDir,
      base: pullRequest.baseSha,
      head: pullRequest.headSha,
      config,
      model,
      diff: { base: mergeBaseSha, head: pullRequest.headSha, files: changedFiles },
      readHead: headContents.readHead,
      // The commits are not fetched, so the source is classified from the account type alone.
      prCommits: [],
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
 * @param deps - The base checkout, event payload, read-only client and log.
 * @param limits - The caps on what is read; the defaults unless a test passes its own.
 * @returns The result that was written to the `result` output, or undefined when there was nothing to score.
 * @throws {@link OpendrsError} If the event is not a `workflow_run`, or the base history needed is not in the checkout.
 */
export async function runScoreOnly(deps: ScoreOnlyDeps, limits: ForkScoreLimits = FORK_SCORE_LIMITS): Promise<ForkResult | undefined> {
  const { io } = deps;
  const completedRun = readCompletedWorkflowRun(deps.event, deps.repository);
  const pullRequest = await findForkPullRequest(deps.client, completedRun);
  if ("skipReason" in pullRequest) {
    io.notice(`opendrs did not score anything: ${pullRequest.skipReason}.`);
    return undefined;
  }
  const result = await io.group("Score", () => scoreForkPullRequest(deps, pullRequest, limits));
  if (result === undefined) return undefined;

  io.info(result.status === "scored" ? `score ${result.score.toFixed(3)}, tier ${result.tier}` : `not scored: over the ${result.reason} limit`);
  io.setOutput("result", serializeForkResult(result));
  io.setOutput("score", result.status === "scored" ? result.score.toFixed(4) : "");
  io.setOutput("tier", result.status === "scored" ? result.tier : "");
  io.summary(renderForkComment(result));
  return result;
}
