// Shared contracts. Every module depends on this file; it depends on nothing.
// Changing a type here is an interface change: update the spec (docs/specs) too.

/** How a value was obtained (REA-style provenance). `unknown` is never "zero risk". */
export type Provenance = "observed" | "derived" | "inferred" | "unknown";

export interface Evidence {
  file?: string;
  line?: number;
  detail: string;
}

/** One feature value produced by a SignalProvider. Weights live in the model, not here. */
export interface Signal {
  /** Stable id, e.g. "size.churn". Must match a key in model weights to affect the score. */
  id: string;
  /** Feature value x (already transformed, e.g. log1p). For `unknown`, the neutral prior. */
  value: number;
  status: Provenance;
  /** One line a reviewer can read, e.g. "412 lines changed across 9 files". */
  summary: string;
  evidence: Evidence[];
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Raw hunk body lines including leading "+", "-", " " markers; "" is also context and "\" rows take no line. Walk with changedLines. */
  lines: string[];
}

export interface ChangedFile {
  /** Path at head (for deleted files, the old path). Repo-relative, forward slashes. */
  path: string;
  oldPath?: string;
  status: FileStatus;
  added: number;
  deleted: number;
  binary: boolean;
  hunks: Hunk[];
  /** True when the file matched `paths.ignore` (lockfiles, generated, vendored). */
  ignored: boolean;
  /** Set when either side is a gitlink (mode 160000): the change moves a submodule pointer. */
  submodule?: true;
}

export interface DiffInfo {
  base: string; // resolved base commit sha (merge-base when scoring a branch)
  head: string; // resolved head commit sha
  files: ChangedFile[];
  author?: { name: string; email: string };
  title?: string; // commit subject or PR title (untrusted)
  description?: string; // PR body (untrusted; only used when llm.includeDescription)
}

/** Who wrote a change: a person, a bot account (Dependabot, Renovate), or an AI coding agent. */
export type SourceKind = "human" | "bot" | "agent";

/** How a pull request's source was recognised. */
export interface Authorship {
  kind: SourceKind;
  /** What it was recognised as, e.g. "dependabot[bot]" or "Claude Code"; "human" for a person. */
  name: string;
  /** What gave it away, e.g. "commit trailer: Co-Authored-By: Claude <noreply@anthropic.com>". */
  evidence: string[];
  /** True when the kind came from the GitHub account type (CI), which the PR itself cannot change. */
  verified: boolean;
  /**
   * The kind the PR is at least, from data its commits cannot change (the account type in CI);
   * "human" when absent. The gate applies this kind's policy too, so commit text cannot escape it.
   */
  floor?: SourceKind;
}

/** One commit as seen by the history index. */
export interface CommitInfo {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** Unix seconds (committer date: rebases and cherry-picks keep old author dates). */
  time: number;
  subject: string;
  /** Changed paths (post-rename names). */
  files: string[];
  isFix: boolean; // subject matches history.fixPattern
  isRevert: boolean;
  /** sha named in "This reverts commit <sha>", when present. */
  revertsSha?: string;
  /** From the author email and the message's trailers (see policy/source.ts). */
  source: SourceKind;
}

/**
 * Point-in-time view of repository history. All queries only see commits with
 * time < `asOf` (unix seconds) when `asOf` is given, so backtests do not leak the future.
 */
export interface HistoryIndex {
  commits: CommitInfo[]; // newest first
  fileCommits(path: string, asOf?: number): CommitInfo[];
  /** Email of the author of the commit that added `path`, if known before asOf. */
  fileCreator(path: string, asOf?: number): string | undefined;
  authorCommitCount(email: string, asOf?: number): number;
}

export interface Incident {
  inducing?: string; // sha of the change that caused it (strongest label)
  fix?: string; // sha of the change that fixed it (blamed via SZZ)
  paths?: string[]; // files/folders implicated
  note?: string;
}

/** Reverse dependency graph over repo files. */
export interface DependencyGraph {
  /** Files that import `path` directly. */
  dependentsOf(path: string): string[];
  /** BFS over dependents up to maxDepth; excludes `path` itself. */
  transitiveDependents(path: string, maxDepth: number): Set<string>;
  /** True when the file's language has an import extractor. */
  supports(path: string): boolean;
  fileCount: number;
}

/** Change kinds the judge may call safe (RADAR's auto-accept categories). */
export const LLM_SAFE_CATEGORIES = ["refactor", "dead_code", "defensive", "logging", "formatting", "docs", "imports", "tests", "static_resources"] as const;
/** Change kinds the judge calls risky; each is also a ranking signal `llm.risk.<category>`. */
export const LLM_RISK_CATEGORIES = ["logic_bug", "security", "performance", "structural", "complex"] as const;
export type LlmCategory = (typeof LLM_SAFE_CATEGORIES)[number] | (typeof LLM_RISK_CATEGORIES)[number];

/** One hunk as shown to the judge. `id` is its `[hunk N]` marker; `line` is its first new-side line (old side for a deletion). */
export interface LlmHunkRef {
  id: number;
  file: string;
  line: number;
}

export interface LlmHunkVerdict {
  file: string;
  line: number;
  category: LlmCategory;
  safe: boolean;
  /** 0-10. */
  confidence: number;
  reason: string;
}

export interface LlmJudgement {
  /** Probability in [0,1] that the change causes an incident. */
  risk: number;
  rationale: string;
  riskySnippets: Array<{ file: string; line?: number; reason: string }>;
  /** 0-10: the judge's confidence in its classification as a whole. */
  confidence: number;
  /** One verdict per shown hunk the judge classified (the riskiest when it answered twice). */
  hunks: LlmHunkVerdict[];
  /** Shown hunks the judge did not classify. */
  unclassified: Array<{ file: string; line: number }>;
  /** Part of the diff was cut to fit llm.maxDiffChars, so the judge did not see all of it. */
  truncated: boolean;
}

export interface LlmJudgeInput {
  title?: string;
  description?: string;
  diff: string;
  files: string[];
  /** The hunks shown in `diff`, by marker id. */
  hunks: LlmHunkRef[];
  truncated: boolean;
}

export type VerifyAction = "keep" | "drop" | "downgrade";
export type VerifyStatus = "new" | "pre_existing" | "unknown";
export type DroppedClass = "docs" | "tests" | "fixtures" | "generated" | "formatting";

/** One verifier verdict (verification spec §3.2). `id` is ours, never read from the model. */
export interface VerifyVerdict {
  id: string;
  action: VerifyAction;
  droppedClass?: DroppedClass;
  status: VerifyStatus;
  /** "file:line", file must be in the diff. */
  citedLine?: string;
  /** <= 200 chars. */
  reason: string;
}

/** What the verifier was asked about: one captain fact, reviewFirst hunk or check (verification spec §3.1). */
export interface VerifyCandidate {
  /** factId / hunkId / checkId (src/brief/selfcheck.ts). */
  id: string;
  kind: "fact" | "hunk" | "check";
  file: string;
  line?: number;
  /** The fact text / hunk reasons / check question. */
  text: string;
  /** The hunk's unified text (<= 2000 chars) or "" when none. */
  excerpt: string;
  /** Deterministic first (verification spec §3.3). */
  status: VerifyStatus;
}

export interface LlmVerifyInput {
  title?: string;
  candidates: VerifyCandidate[];
  /** Base-side excerpt of a coupling partner, keyed by candidate id (for class D, verification spec §3.8). */
  partners: Record<string, string>;
}

export interface LlmVerifyOutput {
  verdicts: VerifyVerdict[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  name: string;
  judge(input: LlmJudgeInput): Promise<LlmJudgement>;
  /** Phase 2 verification; both built-in providers implement it, a test double may omit it. */
  verify?(input: LlmVerifyInput): Promise<LlmVerifyOutput>;
}

/** Attached to a fact, hunk or check after verification. */
export interface Verification {
  action: VerifyAction;
  status: VerifyStatus;
  reason?: string;
  citedLine?: string;
  droppedClass?: DroppedClass;
  /** Who decided: the model, the dismissal memory, or nobody (fail-open / missing verdict). */
  source: "verifier" | "memory" | "unverified";
}

export interface ScoringContext {
  repoDir: string;
  diff: DiffInfo;
  config: import("./config.js").OpendrsConfig;
  history: HistoryIndex;
  /** Absent when graph build failed or was disabled; blast signals then report `unknown`. */
  graph?: DependencyGraph;
  /** Result of the optional LLM judge, run once by the engine before signals. */
  llm?: { judgement?: LlmJudgement; error?: string };
  /** Point-in-time cutoff (unix seconds) used by backtests; undefined = now. */
  asOf?: number;
  /**
   * What the engine could verify. `authorVerified: false` (CI could not tie the head commit's
   * author email to the PR's account) and `historyComplete: false` (shallow clone) make the
   * signals that depend on them report `unknown` instead of a reassuring value.
   */
  trust: { authorVerified: boolean; historyComplete: boolean };
  /** Read a file's contents at base (undefined when the file did not exist). */
  readBase(path: string): Promise<string | undefined>;
  /** Read a file's contents at head (undefined when deleted). */
  readHead(path: string): Promise<string | undefined>;
}

export type SignalProvider = (ctx: ScoringContext) => Promise<Signal[]>;

export interface ModelWeights {
  version: 1;
  intercept: number;
  weights: Record<string, number>;
  /** Neutral value used for a feature whose signal is missing. Default 0. */
  priors?: Record<string, number>;
  /** Present after calibration: score percentiles of history (keys "50","90",...). */
  percentiles?: Record<string, number>;
  trainedOn?: { repo?: string; commits: number; positives: number; from: string; to: string };
  metrics?: BacktestMetrics;
  /**
   * Set by calibrate: whether the fitted weights beat the priors on a validation slice inside the
   * training window. When they don't, the priors are kept and `chosen` is "priors".
   */
  calibration?: { chosen: "fitted" | "priors"; validationAuc: { fitted: number; priors: number } };
}

export interface Contribution {
  id: string;
  value: number;
  weight: number;
  /** weight * value: this signal's push on the logit. */
  contribution: number;
}

export type Tier = "green" | "yellow" | "red";

/**
 * `deferred-review` (RADAR): approve and land now, and assign a human review after merge. Only for
 * PRs that pass every rule except that their score is in the deferred band above green.
 */
export type Decision = "auto-approve" | "deferred-review" | "waiting-ai-review" | "human-review";

/** The gate rules that can fire, by id (see policy/gate.ts). */
export type PolicyRule =
  | "empty-diff" | "paths.block" | "unread-files" | "tests.deleted" | "content.block" | "size-cap" | "tier"
  | "freeze" | "source" | "submodule" | "control-chars" | "llm-failed" | "llm.requireSafe"
  | "unknowns" | "draft" | "changes-requested" | "ai-review" | "sample";

export interface PolicyOutcome {
  tier: Tier;
  decision: Decision;
  /** Why the decision was made, one entry per rule that fired (first is decisive). */
  reasons: string[];
  /** The rule-tagged subset of `reasons`: every fired rule, without the decisive line or notes. Optional for callers built before it existed. */
  rules?: Array<{ rule: PolicyRule; reason: string }>;
  hardBlocked: boolean;
  sampled: boolean;
  mergeMethod: "queue" | "auto-merge" | "none";
  suggestedReviewers: string[];
  /**
   * Minutes the PR must stay eligible (same head commit) before opendrs approves it: a window for a
   * human veto. The largest of autoApprove.landingDelayMinutes and the source's own setting.
   */
  landingDelayMinutes: number;
}

/** One reason a file or hunk ranks where it does in the review brief. */
export interface BriefReason {
  kind: "fix-blame" | "fix-history" | "incident" | "exports" | "dependents" | "critical" | "no-tests" | "new-author" | "llm" | "changed-lines";
  /** Rendered sentence; untrusted parts already escaped. */
  text: string;
  /** Raw untrusted fragment (commit subject, incident note, judge reason), clipped to 120 chars. */
  quote?: string;
  sha?: string;
}

/** How much attention the captain (the final human reviewer) should give this PR (spec §7.1). */
export type CaptainPriority = "careful" | "standard" | "quick";

/** One deterministic architecture or history fact for the captain (spec §6). */
export type ArchitectureFactId =
  | "coupling.missing"
  | "layers.edge"
  | "layers.cycle"
  | "contract.dependency"
  | "contract.api"
  | "contract.schema"
  | "contract.env"
  | "contract.instructions"
  | "change.concurrency"
  | "change.safety_removed"
  | "drift.scope";

export interface ArchitectureFact {
  id: ArchitectureFactId;
  weight: "strong" | "info";
  file: string;
  line?: number;
  /** Rendered sentence; untrusted parts already escaped. */
  text: string;
  verification?: Verification;
}

/** The captain brief (spec §5): priority, reviewer and the facts that back them. */
export interface CaptainBrief {
  priority: CaptainPriority;
  /** A GitHub login when one is known (Action only; spec §7.2). */
  reviewer?: string;
  /** Up to two facts' texts, shortened to their first clause, for the one-line "why". */
  why: string[];
  /** Every fact, strong first, in the fixed detector order (spec §6.5). */
  facts: ArchitectureFact[];
  /** Detectors that could not run, one sentence each. */
  notes: string[];
}

/** The review brief (docs/specs/2026-10-18-review-brief-design.md §6.1). Fields are only added inside version 1. */
export interface ReviewBrief {
  version: 1;
  verdict: { tier: Tier; score: number; decision: Decision; why: string };
  /**
   * "code" when at least one non-skimmable hunk exists, so Review first never lists a skim-listed
   * file (spec §5.6). "skim-only" when every changed hunk is skim-listed, so Review first lists
   * those files anyway and the Markdown says so explicitly. Optional for callers built before it
   * existed; absent means "code".
   */
  reviewFirstScope?: "code" | "skim-only";
  reviewFirst: Array<{
    file: string;
    reasons: BriefReason[];
    hunks: Array<{ id: number; oldStart: number; newStart: number; newLines: number; score: number; reasons: BriefReason[]; verification?: Verification }>;
  }>;
  checks: Array<{ file: string; line?: number; question: string; quotes: string[]; evidence: string[]; verification?: Verification }>;
  skim: Array<{ file: string; category: "docs" | "comment-only" | "tests" }> | { counts: Record<string, number> };
  human: Array<{ rule: PolicyRule; reason: string }>;
  notRanked: { hunks: number; files: number };
  budget: { maxTokens: number; estimatedTokens: number; truncated: boolean; omitted: { files: number; hunks: number; checks: number; notes: number } };
  notes: string[];
  /** Absent when captain.enabled is false. */
  captain?: CaptainBrief;
  /** Present when llm.verify.enabled is true (verification spec §3). */
  verification?: {
    /** "verified": the call succeeded; "failed": fail-open; "skipped": risk-depth or token cap (reason in `note`). */
    outcome: "verified" | "failed" | "skipped";
    note?: string;
    model: string;
    /** First 12 hex of sha256(VERIFY_SYSTEM_PROMPT + JSON.stringify(VERIFY_SCHEMA)). */
    promptHash: string;
    usage?: { inputTokens: number; outputTokens: number };
    /** Every candidate id with its final verdict, dropped ones included (the audit trail the study reads). */
    verdicts: Record<string, Verification>;
    /** Dropped items, in the order they were dropped: rendered as notes. */
    dropped: Array<{ id: string; droppedClass: DroppedClass; reason: string }>;
  };
}

export interface ScoreResult {
  score: number; // [0,1]
  tier: Tier;
  signals: Signal[];
  contributions: Contribution[]; // sorted by |contribution| desc
  unknowns: string[]; // ids of signals with status "unknown"
  policy: PolicyOutcome;
  llm?: LlmJudgement;
  source: Authorship;
  diff: { base: string; head: string; files: number; added: number; deleted: number };
  model: "default" | "calibrated";
  version: string;
  /** Present only when scoreDiff was asked for it (opts.brief). */
  brief?: ReviewBrief;
}

export interface BacktestMetrics {
  commits: number;
  positives: number;
  baseRate: number;
  /** Share of positives captured when gating the top X% riskiest commits. Keys "5","10","50". */
  capturedAt: Record<string, number>;
  auc: number;
}

/** Labelled commit for calibration/backtest. */
export interface LabelledCommit {
  sha: string;
  label: 0 | 1;
  /** Why it is positive: "revert" | "szz" | "incident". */
  source?: "revert" | "szz" | "incident";
}

/** Engine-level error with a user-printable message. */
export class OpendrsError extends Error {
  constructor(
    message: string,
    readonly code: "git" | "config" | "llm" | "io" | "usage",
  ) {
    super(message);
    this.name = "OpendrsError";
  }
}
