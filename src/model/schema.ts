import { z } from "zod";
import type { ModelWeights } from "../domain/types.js";
import { describeSchemaIssues } from "../domain/untrusted.js";
import { LANGUAGE_FAMILIES } from "../signals/language.js";
import { DEFAULT_WEIGHTS } from "./defaults.js";

// A calibrated model file (`config.model`) decides every score, so it is checked strictly before
// it is used: a file with the right `version` but wrong weights could make every pull request
// green, or every one red.

/**
 * The largest intercept or weight a model may have. A logit of 20 is already a score of
 * 0.999999998; fitted weights are far smaller, as the fit is L2-regularized toward the priors.
 */
export const MAX_MODEL_COEFFICIENT = 20;

/** The largest absolute value a prior (the stand-in for an unknown signal's value) may have. */
export const MAX_MODEL_PRIOR = 1000;

/** The most entries `weights` or `priors` may have: every signal id that exists, with room to spare. */
const MAX_MODEL_ENTRIES = 200;

/** The signal ids a model may weigh: the default model's, plus one `lang.*` id per language family. */
const MODEL_SIGNAL_IDS: ReadonlySet<string> = new Set([...Object.keys(DEFAULT_WEIGHTS.weights), ...LANGUAGE_FAMILIES.map((family) => `lang.${family}`)]);

const coefficientSchema = z.number().finite().min(-MAX_MODEL_COEFFICIENT).max(MAX_MODEL_COEFFICIENT);
const signalIdSchema = z.string().refine((id) => MODEL_SIGNAL_IDS.has(id), { message: "unknown signal id" });

/**
 * Checks that the percentile table is ordered: a higher percentile never maps to a lower score.
 * @param table - The model's `percentiles`, already checked to have numeric keys and scores in 0..1.
 * @returns Whether the scores rise (or stay equal) as the percentile rises.
 */
function isOrderedPercentileTable(table: Record<string, number>): boolean {
  const scores = Object.entries(table)
    .map(([percentile, score]) => [Number(percentile), score] as const)
    .sort((left, right) => left[0] - right[0])
    .map(([, score]) => score);
  return scores.every((score, index) => index === 0 || score >= scores[index - 1]!);
}

/**
 * The fields that decide a score are checked strictly. The descriptive ones (`trainedOn`,
 * `metrics`, `calibration`) are only printed, so they are kept as the file has them.
 */
const modelWeightsSchema = z.looseObject({
  version: z.literal(1),
  intercept: coefficientSchema,
  weights: z
    .record(signalIdSchema, coefficientSchema)
    .refine((weights) => Object.keys(weights).length <= MAX_MODEL_ENTRIES, { message: "too many weights" })
    // The LLM judge can only add risk; calibrate floors these weights at 0 for the same reason.
    .refine((weights) => Object.entries(weights).every(([id, weight]) => !id.startsWith("llm.") || weight >= 0), { message: "an llm.* weight is negative" }),
  priors: z
    .record(signalIdSchema, z.number().finite().min(-MAX_MODEL_PRIOR).max(MAX_MODEL_PRIOR))
    .refine((priors) => Object.keys(priors).length <= MAX_MODEL_ENTRIES, { message: "too many priors" })
    .optional(),
  percentiles: z
    .record(z.string().regex(/^(100|[1-9]?[0-9])$/), z.number().finite().min(0).max(1))
    .refine(isOrderedPercentileTable, { message: "percentile scores are not in order" })
    .optional(),
});

/**
 * Parses and checks a model file's text.
 * @param text - The file's contents.
 * @returns The model, or a short description of what is wrong with it (field paths and issue codes only, never the file's own text).
 */
export function parseModelWeights(text: string): { model: ModelWeights } | { problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problem: "not valid JSON" };
  }
  const parsed = modelWeightsSchema.safeParse(value);
  return parsed.success ? { model: parsed.data as ModelWeights } : { problem: describeSchemaIssues(parsed.error.issues) };
}
