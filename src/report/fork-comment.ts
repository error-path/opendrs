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
const MAX_VERSION_LENGTH = 32;
const SHORT_COMMIT_LENGTH = 7;
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
 * Makes a string safe to print: drops every character `disallowedCharacters` matches, caps the length, and wraps it in a code span.
 *
 * Nothing that survives can start a mention, a link, an image, HTML or a table cell, or end the
 * code span: each disallowed set matches `@`, brackets, `<`, `|`, backticks, whitespace and
 * invisible characters, since it matches everything outside a few plain characters.
 *
 * @param text - The value to print. Anything that is not a string prints as `?`.
 * @param disallowedCharacters - A global regular expression, written as a negated character set, that matches each character to drop.
 * @param maxLength - The most characters to keep.
 * @returns The inert text inside backticks.
 */
function formatInertCode(text: unknown, disallowedCharacters: RegExp, maxLength = MAX_TEXT_LENGTH): string {
  const printableText = typeof text === "string" ? text.replace(disallowedCharacters, "").slice(0, maxLength) : "";
  return `\`${printableText === "" ? NOT_A_NUMBER : printableText}\``;
}

const NOT_HEX = /[^0-9a-f]/g;
const NOT_SIGNAL_ID = /[^a-z0-9_.]/g;
const NOT_VERSION = /[^0-9A-Za-z.-]/g;

/**
 * Formats a number with two decimals and a real minus sign.
 *
 * @param value - The value to print.
 * @returns The number, such as `0.71` or `−1.05`, or `?` when it is not a finite number of a printable size.
 */
function formatFixed(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_PRINTED_NUMBER) return NOT_A_NUMBER;
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

/**
 * Formats a signal's push on the score with its sign, as the main comment does.
 *
 * @param value - The signal's contribution.
 * @returns The number with `+` or `−` in front, such as `+1.05`, or `?` when {@link formatFixed} prints `?`.
 */
function formatSigned(value: unknown): string {
  const text = formatFixed(value);
  if (text === NOT_A_NUMBER || text.startsWith("−")) return text;
  return `+${text}`;
}

/**
 * Formats a whole, non-negative count.
 *
 * @param value - The count.
 * @returns The count in digits, or `?` when it is not a safe whole number from 0 to 10^12.
 */
function formatWholeNumber(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRINTED_NUMBER ? String(value) : NOT_A_NUMBER;
}

/**
 * Formats a byte count as whole megabytes.
 *
 * @param bytes - The byte count.
 * @returns The rounded number of megabytes, or `?` when `bytes` is not a finite, non-negative number.
 */
function formatMegabytes(bytes: unknown): string {
  return typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? formatWholeNumber(Math.round(bytes / 1_000_000)) : NOT_A_NUMBER;
}

/**
 * Formats the commit a comment is about as a short hash in a code span.
 *
 * @param commitSha - The full commit hash.
 * @returns Its first seven hex characters inside backticks, or `` `?` `` when it holds none.
 */
function formatShortCommit(commitSha: unknown): string {
  return formatInertCode(commitSha, NOT_HEX, SHORT_COMMIT_LENGTH);
}

/**
 * Renders the lines every fork comment ends with: the advisory note, the opendrs version and, for a score, the model.
 *
 * @param opendrsVersion - The opendrs version that wrote the result, or undefined when the comment has none.
 * @param modelText - The model's name in words, or undefined to leave it out.
 * @returns Two lines of small text.
 */
function renderFooter(opendrsVersion: unknown, modelText: string | undefined): string[] {
  const version = opendrsVersion === undefined ? undefined : `opendrs ${formatInertCode(opendrsVersion, NOT_VERSION, MAX_VERSION_LENGTH)}`;
  return [
    `<sub>${ADVISORY} [How fork pull requests are scored](${FORK_DOCS_URL}).</sub>`,
    `<sub>${[version, modelText, `[${PROJECT_URL.replace("https://", "")}](${PROJECT_URL})`].filter(Boolean).join(" · ")}</sub>`,
  ];
}

/**
 * Renders the comment for a pull request that was scored.
 *
 * @param result - The validated result.
 * @returns The comment's lines, without the marker.
 */
function renderScored(result: ForkScoredResult): string[] {
  const heading = (TIER_TEXT.get(result.tier) ?? "Diff risk {score} · tier unknown").replace("{score}", formatFixed(result.score));
  const counts: Partial<ForkScoredResult["counts"]> = result.counts ?? {};
  const unknownCount = formatWholeNumber(counts.unknowns);
  const lines = [
    `### ${heading}`,
    `<sub>Scored for a fork pull request at ${formatShortCommit(result.head)} · ${formatWholeNumber(counts.files)} files · +${formatWholeNumber(counts.added)} −${formatWholeNumber(counts.deleted)}</sub>`,
    "",
  ];
  const signals = Array.isArray(result.signals) ? result.signals.slice(0, MAX_SIGNAL_ROWS) : [];
  if (signals.length > 0) {
    lines.push("| Signal | Value | Push |", "|---|--:|--:|");
    for (const signal of signals) lines.push(`| ${formatInertCode(signal?.id, NOT_SIGNAL_ID)} | ${formatFixed(signal?.value)} | ${formatSigned(signal?.contribution)} |`);
    lines.push("", `<sub>[What each signal means](${SIGNALS_URL}). Push is the signal's effect on the score: + raises the risk, − lowers it.</sub>`, "");
  }
  if (unknownCount !== "0") {
    lines.push(`${unknownCount} ${unknownCount === "1" ? "signal" : "signals"} unknown, counted as risk and not as zero.`, "");
  }
  lines.push(
    "This score comes from the diff and this repository's history. It was computed without the LLM judge and without checking who wrote the commits, so it can differ from the score a pull request from a branch of this repository would get.",
    "",
    ...renderFooter(result.opendrs ?? NOT_A_NUMBER, MODEL_TEXT.get(result.model)),
  );
  return lines;
}

/** Why a pull request was not scored, by reason; `limit` is the cap it went over. */
const TOO_LARGE_TEXT = new Map<string, (limit: unknown) => string>([
  ["files", (limit) => `it changes more than ${formatWholeNumber(limit)} files`],
  ["bytes", (limit) => `its diff is more than ${formatMegabytes(limit)} MB`],
  ["commits", (limit) => `it has more than ${formatWholeNumber(limit)} commits`],
  ["time", () => "reading its diff and history took too long"],
  ["incomplete", () => "GitHub did not return its complete list of changed files"],
  ["unreadable", () => "GitHub's list of its changed files has an entry opendrs cannot read"],
]);

/**
 * Renders the comment for a pull request that is over a limit and was not scored.
 *
 * @param result - The validated result.
 * @returns The comment's lines, without the marker.
 */
function renderTooLarge(result: ForkTooLargeResult): string[] {
  const describeReason = TOO_LARGE_TEXT.get(result.reason);
  const reasonText = describeReason ? describeReason(result.limit) : "it is over a size limit";
  return [
    "### ⚪ Diff risk not scored · too large to score",
    `<sub>Fork pull request at ${formatShortCommit(result.head)}</sub>`,
    "",
    `opendrs did not score this pull request: ${reasonText}. That is not a low score. Review it as you would any large change, or split it.`,
    "",
    ...renderFooter(result.opendrs ?? NOT_A_NUMBER, undefined),
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

/**
 * Renders the comment that replaces the fork comment when the scoring job failed.
 *
 * The text is fixed apart from the short commit hash, so an earlier score never stays on the pull
 * request looking current.
 *
 * @param headSha - The head commit of the completed workflow run, as GitHub recorded it.
 * @returns The comment body, starting with {@link FORK_COMMENT_MARKER}.
 */
export function renderForkFailureComment(headSha: string): string {
  const lines = [
    "### ⚪ Diff risk not scored",
    "",
    `Not scored: the scoring job failed for ${formatShortCommit(headSha)}. That is not a low score. The workflow run's log says why; re-run it, or review this pull request without a score.`,
    "",
    ...renderFooter(undefined, undefined),
  ];
  return `${[FORK_COMMENT_MARKER, ...lines].join("\n")}\n`;
}
