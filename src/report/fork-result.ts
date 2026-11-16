import { z } from "zod";
import type { ScoreResult } from "../domain/types.js";
import { OpendrsError } from "../domain/types.js";
import { commitShaSchema, describeSchemaIssues } from "../domain/untrusted.js";
import { DEFAULT_WEIGHTS } from "../model/defaults.js";

// The compact result that the fork workflow's scoring job hands to its commenting job. The scoring
// job reads a fork's commits, so the commenting job treats this text as hostile: it is parsed here
// against a closed schema, and nothing outside the schema ever reaches a comment.

/** The largest result, in UTF-8 bytes, that is written or accepted. A real one is under 1 KB. */
export const FORK_RESULT_MAX_BYTES = 4096;
/** How many signals a result carries: the ones that pushed the score most. */
export const FORK_RESULT_MAX_SIGNALS = 6;
/** The signal ids a result may name: the ones the built-in model weighs. */
export const KNOWN_SIGNAL_IDS: ReadonlySet<string> = new Set(Object.keys(DEFAULT_WEIGHTS.weights));
/**
 * Why a pull request was not scored. Four are size limits: changed `files`, patch `bytes`,
 * `commits`, and `time` spent. Two mean the list of changed files could not be read in full, so a
 * score would understate the change: `incomplete` (GitHub listed fewer files than the pull request
 * changes) and `unreadable` (an entry of the listing is not a file as GitHub documents it).
 */
export const TOO_LARGE_REASONS = ["files", "bytes", "commits", "time", "incomplete", "unreadable"] as const;

const MAX_SIGNAL_VALUE = 1e9;
const MAX_CONTRIBUTION = 1e4;
const MAX_COUNT = 1e12;
const DECIMALS = 4;

const opendrsVersion = z.string().max(32).regex(/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[0-9A-Za-z.]{1,16})?$/);
const countSchema = z.number().int().min(0).max(MAX_COUNT);
const signalId = z
  .string()
  .max(48)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,3}$/)
  .refine((id) => KNOWN_SIGNAL_IDS.has(id));

const scoredSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("scored"),
  head: commitShaSchema,
  opendrs: opendrsVersion,
  score: z.number().min(0).max(1),
  tier: z.enum(["green", "yellow", "red"]),
  model: z.enum(["default", "calibrated"]),
  signals: z
    .array(
      z.strictObject({
        id: signalId,
        value: z.number().min(-MAX_SIGNAL_VALUE).max(MAX_SIGNAL_VALUE),
        contribution: z.number().min(-MAX_CONTRIBUTION).max(MAX_CONTRIBUTION),
      }),
    )
    .max(FORK_RESULT_MAX_SIGNALS),
  counts: z.strictObject({ files: countSchema, added: countSchema, deleted: countSchema, unknowns: countSchema }),
});

const tooLargeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("too-large"),
  head: commitShaSchema,
  opendrs: opendrsVersion,
  reason: z.enum(TOO_LARGE_REASONS),
  limit: countSchema,
});

const forkResultSchema = z.discriminatedUnion("status", [scoredSchema, tooLargeSchema]);

/** A fork pull request's score, reduced to the numbers and names the comment shows. */
export type ForkScoredResult = z.infer<typeof scoredSchema>;
/** What the scoring job reports when a fork pull request is over a size limit and was not scored. */
export type ForkTooLargeResult = z.infer<typeof tooLargeSchema>;
/** Either outcome of the fork workflow's scoring job. */
export type ForkResult = ForkScoredResult | ForkTooLargeResult;
/** Which limit a too-large pull request went over. */
export type TooLargeReason = (typeof TOO_LARGE_REASONS)[number];

/**
 * Rounds a signal's number to four decimals and keeps it inside the range the parser accepts.
 *
 * @param value - The number to bound.
 * @param bound - The largest absolute value allowed.
 * @returns The rounded value within `[-bound, bound]`; an infinite value becomes the bound, and NaN becomes 0.
 */
function boundNumber(value: number, bound: number): number {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 0 : Math.sign(value) * bound;
  return Number(Math.min(bound, Math.max(-bound, value)).toFixed(DECIMALS));
}

/** Rounds a count down to a whole number between 0 and the largest the parser accepts. */
const boundCount = (value: number) => (Number.isFinite(value) ? Math.min(MAX_COUNT, Math.max(0, Math.floor(value))) : 0);

/**
 * Reduces a full score to the compact result for a fork pull request.
 *
 * It keeps numbers, the tier, signal ids from the known list and the commit scored. It leaves out
 * everything written from the pull request's own text (signal summaries, policy reasons, file
 * names, authors, reviewers) and the policy decision, which does not apply to a fork.
 *
 * @param scoreResult - The result of scoring the pull request.
 * @returns A result that {@link parseForkResult} accepts.
 * @throws {@link OpendrsError} If the score is not a finite number: a broken score is reported, never turned into 0.
 */
export function buildForkResult(scoreResult: ScoreResult): ForkScoredResult {
  if (!Number.isFinite(scoreResult.score)) {
    throw new OpendrsError("The score is not a finite number, so there is no result to report; this is a bug in opendrs or an invalid model", "io");
  }
  const signals = scoreResult.contributions
    .filter((contribution) => contribution.contribution !== 0 && KNOWN_SIGNAL_IDS.has(contribution.id))
    .slice(0, FORK_RESULT_MAX_SIGNALS)
    .map((contribution) => ({
      id: contribution.id,
      value: boundNumber(contribution.value, MAX_SIGNAL_VALUE),
      contribution: boundNumber(contribution.contribution, MAX_CONTRIBUTION),
    }));
  return {
    schemaVersion: 1,
    status: "scored",
    head: scoreResult.diff.head,
    opendrs: scoreResult.version,
    score: Math.min(1, Math.max(0, boundNumber(scoreResult.score, 1))),
    tier: scoreResult.tier,
    model: scoreResult.model,
    signals,
    counts: {
      files: boundCount(scoreResult.diff.files),
      added: boundCount(scoreResult.diff.added),
      deleted: boundCount(scoreResult.diff.deleted),
      unknowns: boundCount(scoreResult.unknowns.length),
    },
  };
}

/**
 * Builds the result for a fork pull request that is over a size limit and was not scored.
 *
 * @param headSha - The head commit that was measured.
 * @param reason - Which limit it went over.
 * @param limit - That limit's value: files, bytes or commits; 0 for the other reasons.
 * @param opendrsVersion - The opendrs version that measured it.
 * @returns A result that {@link parseForkResult} accepts.
 */
export function buildTooLargeResult(headSha: string, reason: TooLargeReason, limit: number, opendrsVersion: string): ForkTooLargeResult {
  return { schemaVersion: 1, status: "too-large", head: headSha, opendrs: opendrsVersion, reason, limit: boundCount(limit) };
}

/**
 * Writes a fork result as one line of JSON for the scoring job's output.
 *
 * @param result - The result to write.
 * @returns The JSON text, which {@link parseForkResult} reads back.
 * @throws {@link OpendrsError} If the result does not pass its own schema or is over the size cap, which means a bug in opendrs.
 */
export function serializeForkResult(result: ForkResult): string {
  const text = JSON.stringify(result);
  if (!forkResultSchema.safeParse(result).success || Buffer.byteLength(text, "utf8") > FORK_RESULT_MAX_BYTES) {
    throw new OpendrsError("opendrs built a fork result that its own checks reject; this is a bug in opendrs", "io");
  }
  return text;
}

/** Keys that could reach an object's prototype. No result has them, so any is rejected by name. */
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Looks for a key that could reach an object's prototype, at any depth.
 *
 * @param value - The parsed JSON value.
 * @returns True when an object anywhere in `value` has one of {@link PROTOTYPE_KEYS} as its own key.
 */
function hasPrototypeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPrototypeKey);
  if (typeof value !== "object" || value === null) return false;
  return Object.getOwnPropertyNames(value).some((key) => PROTOTYPE_KEYS.has(key) || hasPrototypeKey((value as Record<string, unknown>)[key]));
}

/**
 * Parses the scoring job's result as hostile input.
 *
 * The text must be at most {@link FORK_RESULT_MAX_BYTES} bytes of JSON holding exactly the fields
 * of a {@link ForkResult}: a score in [0, 1], a known tier, a full lower-case commit hash, signal
 * ids from {@link KNOWN_SIGNAL_IDS}, bounded numbers, and no other key at any level.
 *
 * @param text - The `result` output of the scoring job, as received.
 * @returns The validated result.
 * @throws {@link OpendrsError} If the text fails any check. The message names the failed field and never repeats the input.
 */
export function parseForkResult(text: string): ForkResult {
  if (Buffer.byteLength(text, "utf8") > FORK_RESULT_MAX_BYTES) {
    throw new OpendrsError(`The result input is not a valid opendrs fork result: it is larger than ${FORK_RESULT_MAX_BYTES} bytes`, "usage");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OpendrsError("The result input is not a valid opendrs fork result: it is not JSON", "usage");
  }
  if (hasPrototypeKey(value)) {
    throw new OpendrsError("The result input is not a valid opendrs fork result: it has a key no result has", "usage");
  }
  const parsed = forkResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new OpendrsError(`The result input is not a valid opendrs fork result (${describeSchemaIssues(parsed.error.issues)})`, "usage");
  }
  return parsed.data;
}
