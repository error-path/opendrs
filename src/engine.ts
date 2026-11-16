import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OpendrsConfig } from "./domain/config.js";
import type { DependencyGraph, DiffInfo, HistoryIndex, LlmProvider, ModelWeights, ScoreResult, ScoringContext, Signal } from "./domain/types.js";
import { OpendrsError } from "./domain/types.js";
import { buildBrief } from "./brief/build.js";
import { createBlobReader } from "./git/blobs.js";
import { git } from "./git/exec.js";
import { EMPTY_TREE, loadDiff } from "./git/diff.js";
import { buildHistoryIndex } from "./git/history.js";
import { buildDependencyGraph } from "./graph/graph.js";
import { buildDiffText } from "./llm/prompt.js";
import { createLlmProvider } from "./llm/provider.js";
import { DEFAULT_WEIGHTS } from "./model/defaults.js";
import { scoreSignals } from "./model/logistic.js";
import { decide, type GateInput } from "./policy/gate.js";
import { agentPatterns, classifyPr } from "./policy/source.js";
import { SIGNAL_PROVIDERS } from "./signals/index.js";
import { VERSION } from "./version.js";

export interface ScoreOptions {
  repoDir: string;
  base: string;
  head: string;
  config: OpendrsConfig;
  /** Override the model; otherwise config.model is loaded when present, else DEFAULT_WEIGHTS. */
  model?: ModelWeights;
  /**
   * What `model` is reported as in the result. Default "calibrated". A caller that passes
   * DEFAULT_WEIGHTS on purpose, so that no model file is read from the working tree, sets "default".
   */
  modelKind?: "default" | "calibrated";
  /** Reuse across many scorings (calibrate/backtest). */
  history?: HistoryIndex;
  /**
   * History at the base branch's tip, which per-source dailyCap/trackRecord count landed commits
   * from; `history` is cut at the merge-base. Built when needed if absent.
   */
  baseHistory?: HistoryIndex;
  graph?: DependencyGraph | null;
  llm?: LlmProvider | null;
  asOf?: number;
  pr?: GateInput["pr"];
  /** False when CI could not tie the head commit's author to the PR account. Default true. */
  authorVerified?: boolean;
  /** The GitHub account that opened the PR (CI only); its `type` is "Bot" for a GitHub App. */
  account?: { login: string; type?: string };
  title?: string;
  description?: string;
  /** Epoch ms for freeze windows. Default: Date.now(). */
  now?: number;
  /**
   * Build a review brief (ScoreResult.brief). maxTokens defaults to config.brief.maxTokens. With
   * onError, a failure to build it is reported there and the result has no brief; without, it propagates.
   * firstHead/firstRun feed the drift detector (spec §6.4; Action only).
   */
  brief?: { maxTokens?: number; llm?: boolean; firstHead?: string; firstRun?: number; onError?: (message: string) => void };
  /**
   * A diff built outside git, used instead of running `git diff base head`. For a caller that has
   * the change as data but must not fetch the head commit (the Action's fork scoring reads it from
   * the GitHub API). `diff.base` must be a commit in `repoDir`; `diff.head` need not be. The caller
   * sets `binary` and `ignored` on each file. Absent: the diff is loaded from git, as always.
   */
  diff?: DiffInfo;
  /**
   * Reads a file at the head commit, used instead of `git cat-file` when the head commit is not in
   * `repoDir`. Returns undefined for a file it cannot provide. Absent: read from git, as always.
   */
  readHead?: (path: string) => Promise<string | undefined>;
  /**
   * The PR's own commits, newest first, used instead of `git log base..head` when the head commit
   * is not in `repoDir`. An empty list means they are not known: the source is then classified from
   * `account` alone. Absent: read from git, as always.
   */
  pullRequestCommits?: PullRequestCommit[];
}

/** One of the PR's own commits, as `classifyPr` reads it. */
export interface PullRequestCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  message: string;
}

/** Load the calibrated model if config.model exists in the repo; else the default priors. */
export async function loadModel(repoDir: string, config: OpendrsConfig): Promise<{ model: ModelWeights; kind: "default" | "calibrated" }> {
  try {
    const parsed = JSON.parse(await readFile(join(repoDir, config.model), "utf8")) as ModelWeights;
    if (parsed.version === 1 && typeof parsed.intercept === "number") return { model: parsed, kind: "calibrated" };
  } catch {
    // missing or unreadable model file: fall back to priors
  }
  return { model: DEFAULT_WEIGHTS, kind: "default" };
}

const FIELD = "\x1f";
const SHA = /^([0-9a-f]{40}|[0-9a-f]{64})$/;

/** The PR's own commits, newest first, without merges: what `classifyPr` reads and the gate excludes from "landed". */
async function prCommits(repoDir: string, base: string, head: string, maxCommits: number) {
  const range = base === EMPTY_TREE ? head : `${base}..${head}`;
  // Records start with NUL, which a commit message cannot contain, so a message cannot forge a record.
  const out = await git(repoDir, ["log", `-n${maxCommits}`, "--no-merges", "--no-show-signature", `--format=%x00%H${FIELD}%an${FIELD}%ae${FIELD}%B`, "--end-of-options", range]);
  return out.split("\0").flatMap((record) => {
    const [sha = "", authorName = "", authorEmail = "", ...message] = record.trim().split(FIELD);
    return SHA.test(sha) ? [{ sha, authorName, authorEmail, message: message.join(FIELD) }] : [];
  });
}

/** Compute every signal for a diff. Exported for calibrate/backtest, which fit weights on these. */
export async function computeSignals(scoringContext: ScoringContext): Promise<Signal[]> {
  const batches = await Promise.all(SIGNAL_PROVIDERS.map((provider) => provider(scoringContext)));
  return batches.flat();
}

export function makeContext(
  repoDir: string,
  diff: DiffInfo,
  config: OpendrsConfig,
  history: HistoryIndex,
  graph: DependencyGraph | undefined,
  asOf?: number,
  trust: ScoringContext["trust"] = { authorVerified: true, historyComplete: true },
): ScoringContext {
  const read = createBlobReader(repoDir);
  return {
    repoDir,
    diff,
    config,
    history,
    graph,
    asOf,
    trust,
    readBase: (path) => read(diff.base, path),
    readHead: (path) => read(diff.head, path),
  };
}

export async function scoreDiff(options: ScoreOptions): Promise<ScoreResult> {
  const { repoDir, config } = options;
  // A supplied diff is copied, so setting the title and description below leaves the caller's object as it was.
  const diff = options.diff ? { ...options.diff } : await loadDiff(repoDir, options.base, options.head, config);
  if (options.title !== undefined) diff.title = options.title;
  if (options.description !== undefined) diff.description = options.description;

  const [history, graph] = await Promise.all([
    options.history ?? buildHistoryIndex(repoDir, diff.base, config),
    options.graph !== undefined
      ? Promise.resolve(options.graph ?? undefined)
      : config.graph.enabled
        ? buildDependencyGraph(repoDir, diff.base, config).catch(() => undefined)
        : Promise.resolve(undefined),
  ]);

  const shallow = (await git(repoDir, ["rev-parse", "--is-shallow-repository"])).trim() === "true";
  const scoringContext = makeContext(repoDir, diff, config, history, graph, options.asOf, {
    authorVerified: options.authorVerified ?? true,
    historyComplete: !shallow,
  });
  if (options.readHead) scoringContext.readHead = options.readHead;

  let llm: LlmProvider | undefined;
  try {
    // A misconfigured judge (e.g. missing key) becomes an unknown signal, which routes to a human.
    llm = options.llm === null ? undefined : (options.llm ?? createLlmProvider(config));
    if (llm) {
      const { text, hunks, truncated } = buildDiffText(diff, config.llm.maxDiffChars);
      const judgement = await llm.judge({
        title: diff.title,
        description: config.llm.includeDescription ? diff.description : undefined,
        diff: text,
        files: diff.files.filter((f) => !f.ignored).map((f) => f.path),
        hunks,
        truncated,
      });
      scoringContext.llm = { judgement };
    }
  } catch (e) {
    scoringContext.llm = { error: e instanceof OpendrsError ? e.message : `LLM judge failed: ${(e as Error).message}` };
  }

  const signals = await computeSignals(scoringContext);
  const pullRequestCommits = options.pullRequestCommits ?? (await prCommits(repoDir, diff.base, diff.head, config.history.maxCommits));
  // Landed commits include everything on the base branch, not only what is below the merge-base.
  const countsLanded = Object.values(config.sources).some((s) => s.dailyCap !== undefined || s.trackRecord !== undefined);
  const baseHistory = options.baseHistory ?? (countsLanded ? await buildHistoryIndex(repoDir, options.base, config) : history);
  const source = classifyPr(pullRequestCommits, options.account, agentPatterns(config));
  const { model, kind: modelKind } = options.model ? { model: options.model, kind: options.modelKind ?? ("calibrated" as const) } : await loadModel(repoDir, config);
  const { score, logit, contributions } = scoreSignals(signals, model);
  const policy = decide({
    score,
    logit,
    signals,
    contributions,
    diff,
    config,
    model,
    history: baseHistory,
    pr: options.pr,
    llmFailed: Boolean(scoringContext.llm?.error),
    llm: scoringContext.llm?.judgement,
    now: options.now,
    source,
    prCommits: pullRequestCommits.map((commit) => commit.sha),
  });

  const counted = diff.files.filter((f) => !f.ignored);
  const result: ScoreResult = {
    score,
    tier: policy.tier,
    signals,
    contributions,
    unknowns: signals.filter((s) => s.status === "unknown").map((s) => s.id),
    policy,
    llm: scoringContext.llm?.judgement,
    source,
    diff: {
      base: diff.base,
      head: diff.head,
      files: counted.length,
      added: counted.reduce((n, f) => n + f.added, 0),
      deleted: counted.reduce((n, f) => n + f.deleted, 0),
    },
    model: modelKind,
    version: VERSION,
  };
  if (options.brief) {
    try {
      result.brief = await buildBrief(result, scoringContext, {
        maxTokens: options.brief.maxTokens ?? config.brief.maxTokens,
        llm: options.brief.llm,
        firstHead: options.brief.firstHead,
        firstRun: options.brief.firstRun,
        // The same provider as the judge; --no-llm (options.llm === null) disables both.
        verifier: config.llm.verify.enabled ? llm : undefined,
      });
    } catch (e) {
      // The brief is an add-on to the score: the Action keeps the decision and posts without it.
      if (!options.brief.onError) throw e;
      options.brief.onError(`could not build the review brief: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
