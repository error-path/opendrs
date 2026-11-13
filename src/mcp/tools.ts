import { resolve } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { renderBriefMarkdown } from "../brief/render.js";
import { selfCheckItems } from "../brief/selfcheck.js";
import { repoRoot } from "../cli/repo.js";
import { loadConfig } from "../domain/config.js";
import { scoreDiff } from "../engine.js";
import { explainFile } from "../explain.js";
import { gitMaybe } from "../git/exec.js";
import { buildHistoryIndex } from "../git/history.js";
import { hotspots } from "../hotspots.js";
import { describeEmptyDiff, isEmptyDiff } from "../policy/gate.js";
import { suggestReviewers } from "../policy/reviewers.js";

const TOP_CONTRIBUTIONS = 6;
const EVIDENCE_PER_SIGNAL = 3;

const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const fail = (e: unknown): CallToolResult => ({ isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });

async function defaultBase(repoDir: string): Promise<string> {
  const resolved = await gitMaybe(repoDir, ["rev-parse", "--verify", "--quiet", "origin/HEAD^{commit}"]);
  return resolved ? "origin/HEAD" : "main";
}

export async function scoreDiffTool(args: { repoDir: string; base?: string; head?: string }): Promise<CallToolResult> {
  try {
    const repoDir = await repoRoot(resolve(args.repoDir));
    const config = await loadConfig(repoDir);
    const base = args.base ?? (await defaultBase(repoDir));
    const r = await scoreDiff({ repoDir, base, head: args.head ?? "HEAD", config });

    const byId = new Map(r.signals.map((s) => [s.id, s]));
    return ok({
      score: Math.round(r.score * 1000) / 1000,
      tier: r.tier,
      decision: r.policy.decision,
      reasons: r.policy.reasons,
      contributions: r.contributions.slice(0, TOP_CONTRIBUTIONS).map((c) => ({
        id: c.id,
        contribution: Math.round(c.contribution * 1000) / 1000,
        summary: byId.get(c.id)?.summary,
        evidence: byId.get(c.id)?.evidence.slice(0, EVIDENCE_PER_SIGNAL) ?? [],
      })),
      unknowns: r.unknowns,
      suggestedReviewers: r.policy.suggestedReviewers,
      llmRationale: r.llm?.rationale,
      source: r.source,
      diff: r.diff,
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Builds the review brief for the `review_brief` MCP tool.
 *
 * @param args - The repository, the base and head refs (default: the base branch and `HEAD`) and
 *   the brief's token budget.
 * @returns The brief as Markdown text for the model and as structured content; for an empty diff,
 *   the text says there is nothing to score instead.
 */
export async function reviewBriefTool(args: { repoDir: string; base?: string; head?: string; maxTokens?: number }): Promise<CallToolResult> {
  try {
    const repoDir = await repoRoot(resolve(args.repoDir));
    const config = await loadConfig(repoDir);
    const baseRef = args.base ?? (await defaultBase(repoDir));
    const headRef = args.head ?? "HEAD";
    const scoreResult = await scoreDiff({ repoDir, base: baseRef, head: headRef, config, brief: { maxTokens: args.maxTokens } });
    const brief = scoreResult.brief!;
    const text = isEmptyDiff(scoreResult.policy) ? describeEmptyDiff(baseRef, headRef) : renderBriefMarkdown(brief);
    return { content: [{ type: "text", text }], structuredContent: brief as unknown as Record<string, unknown> };
  } catch (e) {
    return fail(e);
  }
}

/** The ids (captain facts, reviewFirst hunks, check questions) a pre-PR self-check should address. */
export async function selfCheckItemsTool(args: { repoDir: string; base?: string; head?: string; maxTokens?: number }): Promise<CallToolResult> {
  try {
    const repoDir = await repoRoot(resolve(args.repoDir));
    const config = await loadConfig(repoDir);
    const base = args.base ?? (await defaultBase(repoDir));
    const r = await scoreDiff({ repoDir, base, head: args.head ?? "HEAD", config, brief: { maxTokens: args.maxTokens } });
    return ok({ items: selfCheckItems(r.brief!) });
  } catch (e) {
    return fail(e);
  }
}

export async function explainFileRiskTool(args: { repoDir: string; path: string }): Promise<CallToolResult> {
  try {
    const repoDir = await repoRoot(resolve(args.repoDir));
    return ok(await explainFile(repoDir, args.path, await loadConfig(repoDir)));
  } catch (e) {
    return fail(e);
  }
}

export async function listHotspotsTool(args: { repoDir: string; top?: number }): Promise<CallToolResult> {
  try {
    const repoDir = await repoRoot(resolve(args.repoDir));
    return ok(await hotspots(repoDir, await loadConfig(repoDir), args.top));
  } catch (e) {
    return fail(e);
  }
}

export async function suggestReviewersTool(args: { repoDir: string; paths: string[] }): Promise<CallToolResult> {
  try {
    const repoDir = await repoRoot(resolve(args.repoDir));
    const history = await buildHistoryIndex(repoDir, "HEAD", await loadConfig(repoDir));
    return ok({ reviewers: suggestReviewers(history, args.paths, undefined) });
  } catch (e) {
    return fail(e);
  }
}
