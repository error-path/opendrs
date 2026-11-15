import type { ForkResult, ForkScoredResult, ForkTooLargeResult } from "./fork-result.js";

// The comment for a fork pull request. Every character comes from the fixed text in this file or
// from a field of a validated ForkResult, and each field is still made inert here: a number is
// formatted as a number, a name is looked up in a table, and the few strings are cut down to a
// small set of characters, capped in length and printed inside a code span.

/** The first line of the fork comment. Different from the main comment's marker, so neither mode edits the other's comment. */
export const FORK_COMMENT_MARKER = "<!-- opendrs-fork -->";

const PROJECT_URL = "https://github.com/error-path/opendrs";
const SIGNALS_URL = "https://error-path.github.io/opendrs/signals.html";
const FORK_DOCS_URL = "https://error-path.github.io/opendrs/github-action.html#fork-pull-requests";
const MAX_SIGNAL_ROWS = 6;
const MAX_TEXT_LENGTH = 48;
const MAX_PRINTED_NUMBER = 1e12;
const NOT_A_NUMBER = "?";

// Maps, not objects: a hostile key such as "constructor" finds nothing.
const TIER_TEXT = new Map([
  ["green", "🟢 Diff risk {score} · green"],
  ["yellow", "🟡 Diff risk {score} · yellow"],
  ["red", "🔴 Diff risk {score} · red"],
]);
const MODEL_TEXT = new Map([
  ["default", "default model"],
  ["calibrated", "calibrated model"],
]);
const ADVISORY = "Advisory only: opendrs never approves or merges a fork pull request, and this comment is not a review.";

/**
 * Makes a string safe to print: keeps only characters from `allowed`, caps the length, and wraps it in a code span.
 *
 * Nothing that survives can start a mention, a link, an image, HTML or a table cell, or end the
 * code span: the allowed sets hold no `@`, brackets, `<`, `|`, backtick, whitespace or invisible character.
 *
 * @param text - The value to print. Anything that is not a string prints as `?`.
 * @param allowed - A character class of the characters to drop, written as a negated set.
 * @param maxLength - The most characters to keep.
 * @returns The inert text inside backticks.
 */
function inertCode(text: unknown, allowed: RegExp, maxLength = MAX_TEXT_LENGTH): string {
  const kept = typeof text === "string" ? text.replace(allowed, "").slice(0, maxLength) : "";
  return `\`${kept === "" ? NOT_A_NUMBER : kept}\``;
}

const NOT_HEX = /[^0-9a-f]/g;
const NOT_SIGNAL_ID = /[^a-z0-9_.]/g;
const NOT_VERSION = /[^0-9A-Za-z.-]/g;

/** Formats a number with two decimals, or `?` when it is not a finite number of a printable size. */
function fixed(value: unknown, minus = "−"): string {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_PRINTED_NUMBER) return NOT_A_NUMBER;
  return `${value < 0 ? minus : ""}${Math.abs(value).toFixed(2)}`;
}

/** Formats a signal's push on the score with its sign, as the main comment does. */
const signed = (value: unknown) => (fixed(value) === NOT_A_NUMBER ? NOT_A_NUMBER : `${(value as number) < 0 ? "−" : "+"}${Math.abs(value as number).toFixed(2)}`);

/** Formats a whole, non-negative count, or `?`. */
const wholeNumber = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRINTED_NUMBER ? String(value) : NOT_A_NUMBER;

/** The lines every fork comment ends with: what kind of score this is, and which opendrs wrote it. */
function footer(result: ForkResult, modelText: string | undefined): string[] {
  const version = `opendrs ${inertCode(result.opendrs, NOT_VERSION, 32)}`;
  return [
    `<sub>${ADVISORY} [How fork pull requests are scored](${FORK_DOCS_URL}).</sub>`,
    `<sub>${[version, modelText, `[${PROJECT_URL.replace("https://", "")}](${PROJECT_URL})`].filter(Boolean).join(" · ")}</sub>`,
  ];
}

/** The commit the comment is about, as a short hash in a code span. */
const shortCommit = (result: ForkResult) => inertCode(result.head, NOT_HEX, 7);

/** Renders the comment for a pull request that was scored. */
function renderScored(result: ForkScoredResult): string[] {
  const heading = (TIER_TEXT.get(result.tier) ?? "Diff risk {score} · tier unknown").replace("{score}", fixed(result.score));
  const counts: Partial<ForkScoredResult["counts"]> = result.counts ?? {};
  const unknowns = wholeNumber(counts.unknowns);
  const lines = [
    `### ${heading}`,
    `<sub>Scored for a fork pull request at ${shortCommit(result)} · ${wholeNumber(counts.files)} files · +${wholeNumber(counts.added)} −${wholeNumber(counts.deleted)}</sub>`,
    "",
  ];
  const signals = Array.isArray(result.signals) ? result.signals.slice(0, MAX_SIGNAL_ROWS) : [];
  if (signals.length > 0) {
    lines.push("| Signal | Value | Push |", "|---|--:|--:|");
    for (const signal of signals) lines.push(`| ${inertCode(signal?.id, NOT_SIGNAL_ID)} | ${fixed(signal?.value)} | ${signed(signal?.contribution)} |`);
    lines.push("", `<sub>[What each signal means](${SIGNALS_URL}). Push is the signal's effect on the score: + raises the risk, − lowers it.</sub>`, "");
  }
  if (unknowns !== "0") {
    lines.push(`${unknowns} ${unknowns === "1" ? "signal" : "signals"} unknown, counted as risk and not as zero.`, "");
  }
  lines.push(
    "This score comes from the diff and this repository's history. It was computed without the LLM judge and without checking who wrote the commits, so it can differ from the score a pull request from a branch of this repository would get.",
    "",
    ...footer(result, MODEL_TEXT.get(result.model)),
  );
  return lines;
}

/** Formats a byte count as whole megabytes, or `?`. */
const megabytes = (bytes: unknown) => (typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? wholeNumber(Math.round(bytes / 1_000_000)) : NOT_A_NUMBER);

/** Why a pull request was not scored, by reason; `limit` is the cap it went over. */
const TOO_LARGE_TEXT = new Map<string, (limit: unknown) => string>([
  ["files", (limit) => `it changes more than ${wholeNumber(limit)} files`],
  ["bytes", (limit) => `its diff is more than ${megabytes(limit)} MB`],
  ["commits", (limit) => `it has more than ${wholeNumber(limit)} commits`],
  ["time", () => "reading its diff and history took too long"],
  ["incomplete", () => "GitHub did not return its complete list of changed files"],
]);

/** Renders the comment for a pull request that is over a limit and was not scored. */
function renderTooLarge(result: ForkTooLargeResult): string[] {
  const describe = TOO_LARGE_TEXT.get(result.reason);
  const why = describe ? describe(result.limit) : "it is over a size limit";
  return [
    "### ⚪ Diff risk not scored · too large to score",
    `<sub>Fork pull request at ${shortCommit(result)}</sub>`,
    "",
    `opendrs did not score this pull request: ${why}. That is not a low score. Review it as you would any large change, or split it.`,
    "",
    ...footer(result, undefined),
  ];
}

/**
 * Renders the comment opendrs posts on a fork pull request.
 *
 * The text is a fixed template filled with the result's numbers, tier, signal ids and short commit
 * hash. It holds no policy decision and nothing from the pull request's title, body, branch, file
 * names or commits.
 *
 * @param result - The scoring job's result, already validated by `parseForkResult`.
 * @returns The comment body, starting with {@link FORK_COMMENT_MARKER}.
 */
export function renderForkComment(result: ForkResult): string {
  const lines = result.status === "too-large" ? renderTooLarge(result) : renderScored(result);
  return `${[FORK_COMMENT_MARKER, ...lines].join("\n")}\n`;
}
