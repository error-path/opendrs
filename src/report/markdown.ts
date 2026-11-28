import type { Authorship, CaptainPriority, Contribution, Decision, LlmJudgement, ReviewBrief, ScoreResult, Tier } from "../domain/types.js";
import { factLine, renderBriefMarkdown, renderFocusBullets } from "../brief/render.js";
import { cell, code, untrusted } from "./escape.js";

const MARKER = "<!-- opendrs -->";
const PROJECT_URL = "https://github.com/error-path/opendrs";
const TOP_CONTRIBUTIONS = 6;
const MAX_UNKNOWNS = 5;
const MAX_SNIPPETS = 3;
const MAX_RATIONALE = 400;
const MAX_CAPTAIN_FACTS = 5;

const TIER_EMOJI: Record<Tier, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
const DECISION_TEXT: Record<Decision, string> = {
  "auto-approve": "auto-approve",
  "deferred-review": "deferred review (lands now, reviewed after merge)",
  "waiting-ai-review": "waiting for AI review",
  "human-review": "human review",
};
const CAPTAIN_LABEL: Record<CaptainPriority, string> = { careful: "careful review", standard: "standard review", quick: "quick confirm" };

/** Spec §8.1: the captain line, plus (unless quick confirm, or there are no facts) the "For the captain" block. */
function renderCaptain(captain: NonNullable<ReviewBrief["captain"]>): string[] {
  const reviewer = captain.reviewer ? ` · @${captain.reviewer}` : "";
  const why = captain.priority !== "quick" && captain.why.length > 0 ? ` · why: ${captain.why.join("; ")}` : "";
  const lines = [`**Captain: ${CAPTAIN_LABEL[captain.priority]}**${reviewer}${why}`];
  if (captain.priority !== "quick" && captain.facts.length > 0) {
    lines.push("**For the captain**", ...captain.facts.slice(0, MAX_CAPTAIN_FACTS).map((f) => `- ${factLine(f)}`));
    if (captain.facts.length > MAX_CAPTAIN_FACTS) lines.push(`- +${captain.facts.length - MAX_CAPTAIN_FACTS} more in the brief below`);
  }
  return lines;
}

/** Terminal text: drop control characters so a summary cannot inject escape sequences. */
const plain = (text: string) => text.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();

const signed = (n: number, minus: string) => `${n < 0 ? minus : "+"}${Math.abs(n).toFixed(2)}`;
const top = (contributions: Contribution[]) => contributions.filter((c) => c.contribution !== 0).slice(0, TOP_CONTRIBUTIONS);
const short = (sha: string) => sha.slice(0, 7);
const clip = (text: string) => (text.length > MAX_RATIONALE ? `${text.slice(0, MAX_RATIONALE)}…` : text);
/** "agent (Claude Code)", or just "human": the name repeats the kind for a person. Raw; callers escape. */
const sourceName = ({ kind, name }: Authorship) => (name === kind ? kind : `${kind} (${name})`);

/** "3 safe (tests 2, docs 1), 2 risky": the judge's hunk verdicts, safe ones broken down by category. */
function hunkCounts(llm: LlmJudgement): string {
  const safe = llm.hunks.filter((h) => h.safe);
  const byCategory = new Map<string, number>();
  for (const h of safe) byCategory.set(h.category, (byCategory.get(h.category) ?? 0) + 1);
  const breakdown = safe.length > 0 ? ` (${[...byCategory].map(([c, n]) => `${c} ${n}`).join(", ")})` : "";
  return `${safe.length} safe${breakdown}, ${llm.hunks.length - safe.length} risky`;
}

/** What the Action posts in place of a brief that would push the comment over GitHub's size limit. */
const BRIEF_OMITTED = "brief omitted: too large for a comment; see the `brief` output";

/** PR comment body. Starts with the `<!-- opendrs -->` marker. `omitBrief` keeps the layout but fences the omission notice instead of the brief. `rescoreLine`, when a previous run's state exists, is inserted right after the `<sub>` lines. */
export function renderMarkdown(result: ScoreResult, opts: { omitBrief?: boolean; rescoreLine?: string; selfCheckLine?: string } = {}): string {
  const { policy, diff } = result;
  const summaryOf = (id: string) => result.signals.find((s) => s.id === id)?.summary ?? "not reported; model prior used";
  const head = [
    MARKER,
    `### ${TIER_EMOJI[result.tier]} Diff risk ${result.score.toFixed(2)} · ${result.tier} · ${DECISION_TEXT[policy.decision]}`,
    `<sub>${diff.files} files · +${diff.added} −${diff.deleted} · \`${short(diff.base)}…${short(diff.head)}\`</sub>`,
    // Name and evidence come from commit messages and author fields the PR author controls.
    `<sub>${[`Source: ${untrusted(sourceName(result.source))}`, ...result.source.evidence.map(untrusted)].join(" · ")}</sub>`,
    ...(opts.rescoreLine ? [opts.rescoreLine] : []),
    "",
  ];

  const body: string[] = [];
  const rows = top(result.contributions);
  if (rows.length > 0) {
    body.push("| Signal | Value | Push | Why |", "|---|--:|--:|---|");
    for (const signalRow of rows) {
      body.push(`| \`${signalRow.id}\` | ${signalRow.value.toFixed(2)} | ${signed(signalRow.contribution, "−")} | ${untrusted(summaryOf(signalRow.id))} |`);
    }
    body.push("");
  }

  if (result.unknowns.length > 0) {
    body.push("**Unknowns** (counted as risk, not as zero)");
    for (const id of result.unknowns.slice(0, MAX_UNKNOWNS)) body.push(`- \`${id}\`: ${untrusted(summaryOf(id))}`);
    if (result.unknowns.length > MAX_UNKNOWNS) body.push(`- …and ${result.unknowns.length - MAX_UNKNOWNS} more`);
    body.push("");
  }

  body.push("**Policy**", ...policy.reasons.map((r) => `- ${cell(r)}`), "");

  if (policy.landingDelayMinutes > 0 && (policy.decision === "auto-approve" || policy.decision === "deferred-review")) {
    body.push(`Landing delay: ${policy.landingDelayMinutes} min after the head commit becomes eligible`, "");
  }

  if (policy.suggestedReviewers.length > 0) {
    body.push(`**Suggested reviewers:** ${policy.suggestedReviewers.map(code).join(", ")}`, "");
  }

  if (result.llm) {
    body.push(`<details><summary>LLM review (p=${result.llm.risk.toFixed(2)})</summary>`, "", `> ${untrusted(clip(result.llm.rationale))}`, "");
    for (const s of result.llm.riskySnippets.slice(0, MAX_SNIPPETS)) {
      body.push(`- ${code(`${s.file}${s.line !== undefined ? `:${s.line}` : ""}`)} ${untrusted(s.reason)}`);
    }
    body.push("", `Hunks: ${hunkCounts(result.llm)}`, "");
    for (const h of result.llm.hunks.filter((h) => !h.safe).slice(0, MAX_SNIPPETS)) {
      body.push(`- ${code(`${h.file}:${h.line}`)} — ${h.category} (${h.confidence}/10): ${untrusted(h.reason)}`);
    }
    body.push("", "</details>", "");
  }

  const footer = `<sub>opendrs ${result.version} · ${result.model} model · [${PROJECT_URL.replace("https://", "")}](${PROJECT_URL})</sub>`;

  if (!result.brief) return `${[...head, ...body, footer].join("\n")}\n`;

  const brief = result.brief;
  const focus = renderFocusBullets(brief).map((b) => `- ${b}`);
  // Spec §2.4: one advisory line, next to the captain line (or standalone when there is none), never
  // inside the five-fact cap or the gate.
  const selfCheck = opts.selfCheckLine ? [opts.selfCheckLine, ""] : [];
  const captain = brief.captain ? [...renderCaptain(brief.captain), ...selfCheck] : selfCheck;
  const sections = [
    ...head,
    ...captain,
    ...(focus.length > 0 ? ["**Review focus**", ...focus, ""] : []),
    "<details><summary>Review brief for AI reviewers (opendrs)</summary>",
    "",
    "~~~~opendrs-brief",
    opts.omitBrief ? BRIEF_OMITTED : renderBriefMarkdown(brief).trimEnd(),
    "~~~~",
    "</details>",
    "",
    "<details><summary>Score details</summary>",
    "",
    ...body,
    "</details>",
    "",
    footer,
  ];
  return `${sections.join("\n")}\n`;
}

/** Short human text for terminals. */
export function renderText(result: ScoreResult): string {
  const { policy, diff } = result;
  const lines = [
    `opendrs risk ${result.score.toFixed(2)}  ${result.tier.toUpperCase()}  -> ${DECISION_TEXT[policy.decision]}`,
    `${diff.files} files, +${diff.added} -${diff.deleted} (${short(diff.base)}..${short(diff.head)}), ${result.model} model, opendrs ${result.version}`,
    `source: ${plain([sourceName(result.source), result.source.evidence.join("; ")].filter(Boolean).join(": "))}`,
  ];

  const rows = top(result.contributions);
  if (rows.length > 0) {
    const width = Math.max(...rows.map((c) => c.id.length));
    lines.push("", "Top contributions (push on the logit):");
    for (const c of rows) {
      const summary = result.signals.find((s) => s.id === c.id)?.summary ?? "model prior";
      lines.push(`  ${signed(c.contribution, "-").padStart(6)}  ${c.id.padEnd(width)}  ${plain(summary)}`);
    }
  }
  if (result.unknowns.length > 0) lines.push("", `Unknowns (counted as risk): ${result.unknowns.join(", ")}`);
  lines.push("", "Policy:", ...policy.reasons.map((r) => `  - ${plain(r)}`));
  if (policy.suggestedReviewers.length > 0) lines.push(`Reviewers: ${policy.suggestedReviewers.join(", ")}`);
  if (result.llm) lines.push(`LLM (p=${result.llm.risk.toFixed(2)}; hunks: ${hunkCounts(result.llm)}): ${plain(clip(result.llm.rationale))}`);
  return `${lines.join("\n")}\n`;
}
