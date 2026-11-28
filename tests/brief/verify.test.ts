import { describe, expect, it } from "vitest";
import { buildBrief } from "../../src/brief/build.js";
import { factHash } from "../../src/brief/facts-memory.js";
import { renderBriefMarkdown } from "../../src/brief/render.js";
import { factIds } from "../../src/brief/selfcheck.js";
import { applyVerification, collectCandidates, verifyBrief } from "../../src/brief/verify.js";
import { defaultConfig } from "../../src/domain/config.js";
import type { ArchitectureFact, LlmProvider, LlmVerifyInput, ReviewBrief, Verification, VerifyVerdict } from "../../src/domain/types.js";
import { makeContext } from "../../src/engine.js";
import { loadDiff } from "../../src/git/diff.js";
import { buildHistoryIndex } from "../../src/git/history.js";
import { verifyPromptHash } from "../../src/llm/verify.js";
import { fakeResult } from "../cli/helpers.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";

async function ctxFor(repo: TestRepo, base: string) {
  const config = defaultConfig();
  const diff = await loadDiff(repo.dir, base, "HEAD", config);
  const history = await buildHistoryIndex(repo.dir, diff.base, config);
  return makeContext(repo.dir, diff, config, history, undefined);
}

const pkg = (deps: string[]) => JSON.stringify({ dependencies: Object.fromEntries(deps.map((d) => [d, "^1.0.0"])) }, null, 2);
const FACT: ArchitectureFact = { id: "contract.dependency", weight: "strong", file: "package.json", line: 4, text: "New runtime dependency `jsonwebtoken` (`package.json:4`)." };
const FACT_ID = "contract.dependency:package.json:4";
const memoryLine = (verdict: string) => `${JSON.stringify({ hash: factHash(FACT), id: FACT.id, file: FACT.file, verdict, at: "2026-10-22T10:00:00Z" })}\n`;

/** A fixed regression, a new runtime dependency: one strong fact, two review-first hunks, three checks. */
function depRepo(baseExtra: Record<string, string> = {}, headExtra: Record<string, string> = {}) {
  const repo = makeRepo();
  repo.commit({ "src/a.ts": "1\n2\n3\n4\n5\n", "package.json": pkg(["foo"]) }, "base");
  repo.commit({ "src/a.ts": "1\nFIXED\n3\n4\n5\n" }, "fix: NPE in a.ts");
  const base = repo.commit({ "src/a.ts": "1\nFIXED\n3\n4\n5\n6\n", ...baseExtra }, "more");
  repo.commit({ "src/a.ts": "1\nFIXED but changed again\n3\n4\n5\n6\n", "package.json": pkg(["foo", "jsonwebtoken"]), ...headExtra }, "touch it");
  return { repo, base };
}

const fakeVerifier = (verify?: LlmProvider["verify"]): LlmProvider => ({
  name: "fake",
  judge: async () => {
    throw new Error("the verifier never judges");
  },
  ...(verify ? { verify } : {}),
});
const verdict = (id: string, action: VerifyVerdict["action"], extra: Partial<VerifyVerdict> = {}): VerifyVerdict => ({ id, action, status: "new", reason: "r", ...extra });
const answering = (verdicts: VerifyVerdict[], seen: LlmVerifyInput[] = []) =>
  fakeVerifier(async (input) => {
    seen.push(input);
    return { verdicts, usage: { inputTokens: 10, outputTokens: 5 } };
  });

async function assembled(repo: TestRepo, base: string) {
  const ctx = await ctxFor(repo, base);
  const brief = await buildBrief(fakeResult(0.3), ctx, {});
  return { ctx, brief };
}

describe("collectCandidates", () => {
  it("lists facts, shown hunks and checks with Phase 1 ids, each with its hunk excerpt", async () => {
    const { repo, base } = depRepo();
    const { ctx, brief } = await assembled(repo, base);
    const { candidates, partners } = await collectCandidates(brief, ctx);
    expect(candidates.map((c) => [c.id, c.kind, c.status])).toEqual([
      [FACT_ID, "fact", "new"],
      ["hunk:src/a.ts:2", "hunk", "new"],
      ["hunk:package.json:1", "hunk", "new"],
      ["check:src/a.ts:1:0", "check", "new"],
      ["check:src/a.ts:-:0", "check", "new"],
      ["check:package.json:-:0", "check", "new"],
    ]);
    expect(candidates[0]).toMatchObject({ file: "package.json", line: 4, text: FACT.text });
    expect(candidates[0]!.excerpt).toMatch(/^@@ -1,5 \+1,6 @@\n/);
    expect(candidates[0]!.excerpt).toContain('+    "jsonwebtoken": "^1.0.0"');
    expect(candidates[1]!.excerpt).toMatch(/^@@ -1,5 \+1,5 @@\n/);
    expect(candidates[1]!.text).toContain("edits lines last changed by fix");
    expect(candidates[3]!.text).toContain("bring that problem back");
    expect(candidates[3]!.excerpt).toBe(candidates[1]!.excerpt);
    expect(partners).toEqual({});
    repo.cleanup();
  });

  it("marks a hunk pre_existing when every added line already occurs in the file at base", async () => {
    const repo = makeRepo();
    const base = repo.commit({ "src/a.ts": "alpha\nbeta\ngamma\n" }, "base");
    repo.commit({ "src/a.ts": "beta\nalpha\ngamma\n" }, "swap");
    const { ctx, brief } = await assembled(repo, base);
    const { candidates } = await collectCandidates(brief, ctx);
    expect(candidates.find((c) => c.kind === "hunk")?.status).toBe("pre_existing");
    repo.cleanup();
  });

  it("gives a coupling.missing fact status unknown and the partner's base text, trimmed to 2000 chars", async () => {
    const repo = makeRepo();
    const base = repo.commit({ "src/a.ts": "1\n", "src/b.ts": `${"b".repeat(3000)}\n` }, "base");
    repo.commit({ "src/a.ts": "2\n" }, "change a");
    const ctx = await ctxFor(repo, base);
    const fact: ArchitectureFact = { id: "coupling.missing", weight: "strong", file: "src/a.ts", text: "`src/b.ts` changed with `src/a.ts` in 9 of 10 commits (last 30 days); this PR changes only `src/a.ts`." };
    const brief = await buildBrief(fakeResult(0.3), ctx, {});
    brief.captain!.facts = [fact];
    const { candidates, partners } = await collectCandidates(brief, ctx);
    expect(candidates[0]).toMatchObject({ id: "coupling.missing:src/a.ts", status: "unknown", excerpt: expect.stringContaining("+2") });
    expect(partners["coupling.missing:src/a.ts"]).toBe("b".repeat(2000));
    repo.cleanup();
  });

  it("gives two facts that share one id+file+line distinct candidate ids, so neither's partner excerpt overwrites the other's", async () => {
    const repo = makeRepo();
    const base = repo.commit({ "src/a.ts": "1\n", "src/b.ts": "B\n", "src/c.ts": "C\n" }, "base");
    repo.commit({ "src/a.ts": "2\n" }, "change a");
    const ctx = await ctxFor(repo, base);
    const factB: ArchitectureFact = { id: "coupling.missing", weight: "strong", file: "src/a.ts", text: "`src/b.ts` changed with `src/a.ts` in 9 of 10 commits (last 30 days); this PR changes only `src/a.ts`." };
    const factC: ArchitectureFact = { id: "coupling.missing", weight: "strong", file: "src/a.ts", text: "`src/c.ts` changed with `src/a.ts` in 8 of 10 commits (last 30 days); this PR changes only `src/a.ts`." };
    const brief = await buildBrief(fakeResult(0.3), ctx, {});
    brief.captain!.facts = [factB, factC];
    const { candidates, partners } = await collectCandidates(brief, ctx);
    const ids = candidates.filter((c) => c.kind === "fact").map((c) => c.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(partners[ids[0]!]).toBe("B\n");
    expect(partners[ids[1]!]).toBe("C\n");
    repo.cleanup();
  });
});

describe("verifyBrief", () => {
  it("applies keep, drop and downgrade, records the audit trail and renders the fixed suffixes", async () => {
    const { repo, base } = depRepo();
    const { ctx, brief } = await assembled(repo, base);
    const seen: LlmVerifyInput[] = [];
    const out = await verifyBrief(
      brief,
      ctx,
      answering(
        [
          verdict(FACT_ID, "keep", { reason: "real dependency" }),
          verdict("hunk:package.json:1", "drop", { droppedClass: "generated", citedLine: "package.json:4", reason: "lockstep manifest" }),
          verdict("check:src/a.ts:1:0", "downgrade", { citedLine: "src/a.ts:2", reason: "the fix is intact" }),
          verdict("fact:nope", "drop", { droppedClass: "docs", citedLine: "src/a.ts:1" }),
        ],
        seen,
      ),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]!.candidates.map((c) => c.id)).toContain("hunk:src/a.ts:2");
    expect(out.captain!.facts[0]!.verification).toEqual({ action: "keep", status: "new", reason: "real dependency", source: "verifier" });
    expect(out.reviewFirst.map((f) => f.file)).toEqual(["src/a.ts"]);
    expect(out.reviewFirst[0]!.hunks[0]!.verification).toEqual({ action: "keep", status: "new", source: "unverified" });
    expect(out.checks.map((c) => [c.file, c.line, c.verification?.action])).toEqual([
      ["src/a.ts", undefined, "keep"],
      ["package.json", undefined, "keep"],
      ["src/a.ts", 1, "downgrade"],
    ]);
    expect(out.verification).toEqual({
      outcome: "verified",
      model: "claude-sonnet-5",
      promptHash: verifyPromptHash(),
      usage: { inputTokens: 10, outputTokens: 5 },
      verdicts: {
        [FACT_ID]: { action: "keep", status: "new", reason: "real dependency", source: "verifier" },
        "hunk:src/a.ts:2": { action: "keep", status: "new", source: "unverified" },
        "hunk:package.json:1": { action: "drop", status: "new", reason: "lockstep manifest", citedLine: "package.json:4", droppedClass: "generated", source: "verifier" },
        "check:src/a.ts:1:0": { action: "downgrade", status: "new", reason: "the fix is intact", citedLine: "src/a.ts:2", source: "verifier" },
        "check:src/a.ts:-:0": { action: "keep", status: "new", source: "unverified" },
        "check:package.json:-:0": { action: "keep", status: "new", source: "unverified" },
      },
      dropped: [{ id: "hunk:package.json:1", droppedClass: "generated", reason: "lockstep manifest" }],
    });
    expect(out.notes).toEqual([
      `verifier: claude-sonnet-5 · prompt ${verifyPromptHash()} · 10+5 tokens`,
      "dropped by verifier: generated — lockstep manifest (hunk:package.json:1)",
    ]);
    const md = renderBriefMarkdown(out);
    expect(md).toContain("(`package.json:4`). [verified · new]\n");
    expect(md).toContain("«fix: NPE in a.ts» [unverified]\n");
    expect(md).toContain("bring that problem back? [downgraded by verifier: «the fix is intact»]\n");
    expect(md).not.toContain("`package.json`\n");
    repo.cleanup();
  });

  it("fails open on a throwing provider: nothing dropped or downgraded, everything [unverified], one note", async () => {
    const { repo, base } = depRepo();
    const { ctx, brief } = await assembled(repo, base);
    const out = await verifyBrief(
      brief,
      ctx,
      fakeVerifier(async () => {
        throw new Error("boom");
      }),
    );
    expect(out.verification).toMatchObject({ outcome: "failed", note: "boom", dropped: [] });
    expect(out.notes).toEqual(["verifier failed: boom; everything below is unverified"]);
    expect(out.captain!.facts).toHaveLength(1);
    expect(out.reviewFirst.flatMap((f) => f.hunks)).toHaveLength(2);
    expect(out.checks).toHaveLength(3);
    const all = [...out.captain!.facts, ...out.reviewFirst.flatMap((f) => f.hunks), ...out.checks].map((x) => x.verification);
    expect(all).toHaveLength(6);
    for (const v of all) expect(v).toEqual({ action: "keep", status: "new", source: "unverified" });
    expect(renderBriefMarkdown(out).match(/\[unverified\]/g)).toHaveLength(6);
    repo.cleanup();
  });

  it("fails open when the provider has no verify()", async () => {
    const { repo, base } = depRepo();
    const { ctx, brief } = await assembled(repo, base);
    const out = await verifyBrief(brief, ctx, fakeVerifier());
    expect(out.verification?.outcome).toBe("failed");
    expect(out.notes[0]).toMatch(/^verifier failed: .*fake.*; everything below is unverified$/);
    repo.cleanup();
  });

  it("skips the call on a quick-confirm PR whose only candidates are info facts", async () => {
    const repo = makeRepo();
    const base = repo.commit({ "a.ts": "1\n" }, "base");
    repo.commit({ "a.ts": "2\n" }, "change");
    const { ctx, brief } = await assembled(repo, base);
    const info: ArchitectureFact = { id: "contract.dependency", weight: "info", file: "a.ts", text: "New development dependency `x` (`a.ts:1`)." };
    const quick: ReviewBrief = { ...brief, reviewFirst: [], checks: [], captain: { ...brief.captain!, priority: "quick", facts: [info] } };
    const seen: LlmVerifyInput[] = [];
    const out = await verifyBrief(quick, ctx, answering([], seen));
    expect(seen).toHaveLength(0);
    expect(out.verification).toMatchObject({ outcome: "skipped", note: "quick-confirm PR with only info facts" });
    expect(out.notes).toEqual(["verifier skipped: quick-confirm PR with only info facts"]);
    expect(out.captain!.facts[0]!.verification).toEqual({ action: "keep", status: "new", source: "unverified" });
    repo.cleanup();
  });

  it("skips the call when the prompt exceeds llm.verify.maxTokens", async () => {
    const { repo, base } = depRepo();
    const { ctx, brief } = await assembled(repo, base);
    ctx.config.llm.verify.maxTokens = 50;
    const seen: LlmVerifyInput[] = [];
    const out = await verifyBrief(brief, ctx, answering([], seen));
    expect(seen).toHaveLength(0);
    expect(out.verification?.outcome).toBe("skipped");
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatch(/^verifier skipped: prompt of \d{3,} tokens exceeds llm\.verify\.maxTokens \(50\)$/);
    expect(out.captain!.facts[0]!.verification?.source).toBe("unverified");
    repo.cleanup();
  });

  it("downgrades a fact dismissed in the base commit's memory without showing it to the model", async () => {
    const { repo, base } = depRepo({ ".opendrs/facts.jsonl": memoryLine("wrong") });
    const { ctx, brief } = await assembled(repo, base);
    const seen: LlmVerifyInput[] = [];
    const out = await verifyBrief(brief, ctx, answering([], seen));
    expect(seen[0]!.candidates.map((c) => c.id)).not.toContain(FACT_ID);
    expect(out.captain!.facts[0]).toMatchObject({ weight: "info", verification: { action: "downgrade", status: "new", reason: "dismissed earlier as wrong", source: "memory" } });
    expect(out.verification!.verdicts[FACT_ID]!.source).toBe("memory");
    expect(renderBriefMarkdown(out)).toContain("(`package.json:4`). [downgraded: dismissed earlier as wrong]\n");
    repo.cleanup();
  });

  it("never drops or downgrades a fact pinned useful, whatever the model says", async () => {
    const { repo, base } = depRepo({ ".opendrs/facts.jsonl": memoryLine("useful") });
    const { ctx, brief } = await assembled(repo, base);
    const seen: LlmVerifyInput[] = [];
    const out = await verifyBrief(brief, ctx, answering([verdict(FACT_ID, "drop", { droppedClass: "docs", citedLine: "package.json:4", reason: "just a manifest" })], seen));
    expect(seen[0]!.candidates.map((c) => c.id)).toContain(FACT_ID);
    expect(out.captain!.facts).toHaveLength(1);
    expect(out.captain!.facts[0]).toMatchObject({ weight: "strong", verification: { action: "keep", status: "new", source: "verifier" } });
    expect(out.verification!.dropped).toEqual([]);

    const down = await verifyBrief(brief, ctx, answering([verdict(FACT_ID, "downgrade", { citedLine: "package.json:4" })]));
    expect(down.captain!.facts[0]).toMatchObject({ weight: "strong", verification: { action: "keep" } });
    repo.cleanup();
  });

  it("reads the memory from base, so a PR cannot dismiss its own fact", async () => {
    const { repo, base } = depRepo({}, { ".opendrs/facts.jsonl": memoryLine("wrong") });
    const { ctx, brief } = await assembled(repo, base);
    const seen: LlmVerifyInput[] = [];
    const out = await verifyBrief(brief, ctx, answering([verdict(FACT_ID, "keep")], seen));
    expect(seen[0]!.candidates.map((c) => c.id)).toContain(FACT_ID);
    // The head's .opendrs change fires contract.instructions too, so find the dependency fact by id.
    expect(out.captain!.facts.find((f) => f.id === "contract.dependency")).toMatchObject({ weight: "strong", verification: { action: "keep", source: "verifier" } });
    repo.cleanup();
  });

  it("fails open on an unreadable memory file", async () => {
    const { repo, base } = depRepo({ ".opendrs/facts.jsonl": "{not json\n" });
    const { ctx, brief } = await assembled(repo, base);
    const out = await verifyBrief(brief, ctx, answering([]));
    expect(out.verification?.outcome).toBe("failed");
    expect(out.notes[0]).toMatch(/^verifier failed: \.opendrs\/facts\.jsonl line 1/);
    repo.cleanup();
  });
});

describe("applyVerification", () => {
  const meta: ReviewBrief["verification"] = { outcome: "verified", model: "m", promptHash: "0".repeat(12), verdicts: {}, dropped: [] };
  const fact = (id: ArchitectureFact["id"], file: string, weight: ArchitectureFact["weight"] = "strong"): ArchitectureFact => ({ id, weight, file, text: `${id} in ${file}. Second sentence.` });
  const hunk = (id: number, score: number) => ({ id, oldStart: id, newStart: id, newLines: 1, score, reasons: [] });
  const check = (file: string, line: number | undefined, question: string) => ({ file, line, question, quotes: [], evidence: [] });
  const v = (action: Verification["action"], extra: Partial<Verification> = {}): Verification => ({ action, status: "new", reason: "r", citedLine: "src/a.ts:1", source: "verifier", ...extra });
  const base = (): ReviewBrief => ({
    version: 1,
    verdict: { tier: "green", score: 0.1, decision: "auto-approve", why: "" },
    reviewFirst: [
      { file: "src/a.ts", reasons: [], hunks: [hunk(1, 5), hunk(2, 3)] },
      { file: "src/b.ts", reasons: [], hunks: [hunk(3, 4)] },
    ],
    checks: [check("src/a.ts", 1, "first?"), check("src/a.ts", undefined, "second?"), check("src/b.ts", 3, "third?")],
    skim: [],
    human: [],
    notRanked: { hunks: 0, files: 0 },
    budget: { maxTokens: 2500, estimatedTokens: 0, truncated: false, omitted: { files: 0, hunks: 0, checks: 0, notes: 0 } },
    notes: ["existing note"],
    captain: { priority: "careful", why: ["layers.edge in src/a.ts", "contract.api in src/b.ts"], facts: [fact("layers.edge", "src/a.ts"), fact("contract.api", "src/b.ts")], notes: [] },
  });

  it("downgrading a fact drops it to info and re-sorts; why follows the facts, priority does not move", () => {
    const out = applyVerification(base(), new Map([["layers.edge:src/a.ts", v("downgrade")]]), meta);
    expect(out.captain!.facts.map((f) => [f.id, f.weight, f.verification?.action])).toEqual([
      ["contract.api", "strong", "keep"],
      ["layers.edge", "info", "downgrade"],
    ]);
    expect(out.captain!.why).toEqual(["contract.api in src/b.ts", "layers.edge in src/a.ts"]);
    expect(out.captain!.priority).toBe("careful");
  });

  it("dropping a fact removes it, notes it and keeps it in the audit trail; why shrinks with it", () => {
    const drop = v("drop", { droppedClass: "docs", reason: "readme only" });
    const out = applyVerification(base(), new Map([["layers.edge:src/a.ts", drop]]), meta);
    expect(out.captain!.facts.map((f) => f.id)).toEqual(["contract.api"]);
    expect(out.captain!.why).toEqual(["contract.api in src/b.ts"]);
    expect(out.notes).toEqual(["existing note", "dropped by verifier: docs — readme only (layers.edge:src/a.ts)"]);
    expect(out.verification!.dropped).toEqual([{ id: "layers.edge:src/a.ts", droppedClass: "docs", reason: "readme only" }]);
    expect(out.verification!.verdicts["layers.edge:src/a.ts"]).toEqual(drop);
  });

  it("a downgraded hunk moves last and stops counting toward its file, which re-sorts; a dropped hunk goes, and an emptied file with it", () => {
    const out = applyVerification(base(), new Map([["hunk:src/a.ts:1", v("downgrade")]]), meta);
    expect(out.reviewFirst.map((f) => [f.file, f.hunks.map((h) => h.id)])).toEqual([
      ["src/b.ts", [3]],
      ["src/a.ts", [2, 1]],
    ]);
    expect(out.reviewFirst[1]!.hunks[1]!.verification?.action).toBe("downgrade");

    const gone = applyVerification(base(), new Map([["hunk:src/b.ts:3", v("drop", { droppedClass: "tests" })]]), meta);
    expect(gone.reviewFirst.map((f) => f.file)).toEqual(["src/a.ts"]);
    expect(gone.verification!.dropped.map((d) => d.id)).toEqual(["hunk:src/b.ts:3"]);
  });

  it("a downgraded check moves last; a dropped one goes", () => {
    const out = applyVerification(base(), new Map([["check:src/a.ts:1:0", v("downgrade")], ["check:src/a.ts:-:0", v("drop", { droppedClass: "formatting" })]]), meta);
    expect(out.checks.map((c) => [c.question, c.verification?.action])).toEqual([
      ["third?", "keep"],
      ["first?", "downgrade"],
    ]);
    expect(out.checks[0]!.verification?.source).toBe("unverified");
  });

  it("two facts sharing one id+file+line each get their own verdict, not merged or swapped", () => {
    const twoCoupling: ArchitectureFact[] = [
      { id: "coupling.missing", weight: "strong", file: "src/z.ts", text: "`src/x.ts` changed with `src/z.ts` in 9 of 10 commits." },
      { id: "coupling.missing", weight: "strong", file: "src/z.ts", text: "`src/y.ts` changed with `src/z.ts` in 8 of 10 commits." },
    ];
    const brief: ReviewBrief = { ...base(), captain: { ...base().captain!, facts: twoCoupling } };
    const ids = factIds(twoCoupling);
    expect(new Set(ids).size).toBe(2); // the fixture itself must collide on id+file+line before any suffix
    const out = applyVerification(brief, new Map([[ids[0]!, v("keep")], [ids[1]!, v("drop", { droppedClass: "docs", reason: "noise" })]]), meta);
    expect(out.captain!.facts).toHaveLength(1);
    expect(out.captain!.facts[0]!.text).toBe(twoCoupling[0]!.text);
    expect(out.captain!.facts[0]!.verification?.action).toBe("keep");
    expect(out.verification!.dropped).toEqual([{ id: ids[1], droppedClass: "docs", reason: "noise" }]);
  });
});

describe("buildBrief with a verifier", () => {
  it("runs it after the captain priority is computed and before the budget: priority from the pre-verification facts, facts and why after", async () => {
    const { repo, base } = depRepo();
    const ctx = await ctxFor(repo, base);
    const plain = await buildBrief(fakeResult(0.3), ctx, {});
    expect(plain.verification).toBeUndefined();
    expect(plain.captain).toMatchObject({ priority: "standard", facts: [FACT] });

    const verified = await buildBrief(fakeResult(0.3), ctx, { verifier: answering([verdict(FACT_ID, "drop", { droppedClass: "docs", citedLine: "package.json:4", reason: "manifest" })]) });
    expect(verified.captain).toMatchObject({ priority: "standard", facts: [], why: [] });
    expect(verified.verification?.outcome).toBe("verified");
    expect(verified.budget.estimatedTokens).toBeGreaterThan(0);
    expect(renderBriefMarkdown(verified)).toContain("Note: dropped by verifier: docs — manifest (contract.dependency:package.json:4)");
    repo.cleanup();
  });
});
