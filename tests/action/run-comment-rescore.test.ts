import { describe, expect, it, vi } from "vitest";
import { type ScoreResult } from "../../src/domain/types.js";
import { type TestRepo } from "../helpers/repo.js";
import { API, BOT } from "./fake-github.js";
import { renderMarkdown, COMMENT_MARKER, stateMarker, MAIN_COMMENT_LINK, result, run, BRIEF } from "./run-harness.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/report/markdown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/report/markdown.js")>()),
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\n## Risk report"),
}));
describe("comment", () => {
  it("creates one marked comment when none exists", async () => {
    const t = await run();
    await t.promise;
    expect(t.gh.ops("createComment")).toHaveLength(1);
    expect(t.gh.comments[0]!.body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(t.gh.comments[0]!.body).toContain("## Risk report");
  });

  it("updates the bot's existing marked comment instead of adding another", async () => {
    const t = await run({
      gh: {
        comments: [
          { id: 1, body: `${COMMENT_MARKER}\nquoted by a human`, user: { login: "alice", type: "User" } },
          { id: 2, body: `${COMMENT_MARKER}\nold report`, user: BOT },
        ],
      },
    });
    await t.promise;
    expect(t.gh.ops("createComment")).toEqual([]);
    expect(t.gh.ops("updateComment").map((e) => e.path)).toEqual(["/repos/o/r/issues/comments/2"]);
    expect(t.gh.comments[0]!.body).toContain("quoted by a human");
    expect(t.gh.comments[1]!.body).toContain("## Risk report");
  });

  it("when the token identity is unknown, updates only a bot's marked comment", async () => {
    const t = await run({
      gh: {
        forbid: new Set(["viewer"]),
        comments: [
          { id: 1, body: `${COMMENT_MARKER}\nquoted by a human`, user: { login: "alice", type: "User" } },
          { id: 2, body: `${COMMENT_MARKER}\nold report`, user: BOT },
        ],
      },
    });
    await t.promise;
    expect(t.gh.ops("createComment")).toEqual([]);
    expect(t.gh.ops("updateComment").map((e) => e.path)).toEqual(["/repos/o/r/issues/comments/2"]);
  });

  it("skips the comment when the input is false", async () => {
    const t = await run({ inputs: { comment: false } });
    await t.promise;
    expect(t.gh.ops("listComments")).toEqual([]);
    expect(t.gh.ops("createComment")).toEqual([]);
  });

  it("warns and continues when commenting is forbidden", async () => {
    const t = await run({ gh: { forbid: new Set(["createComment"]) } });
    await t.promise;
    expect(t.log()).toMatch(/::warning::.*comment/i);
    expect(t.gh.labels).toEqual(["risk:green"]);
  });

  it("fails the job on a non-permission API error", async () => {
    const t = await run({ gh: { fail: new Set(["createComment"]) } });
    await expect(t.promise).rejects.toThrow(/500/);
  });
});

describe("re-scoring", () => {
  const PREV_HEAD = "c".repeat(40);
  const prevState = (over: Partial<Parameters<typeof stateMarker>[0]> = {}) =>
    ({ head: PREV_HEAD, score: 0.76, tier: "yellow" as const, decision: "human-review" as const, run: 1, ...over });
  const rescoreOpts = () => vi.mocked(renderMarkdown).mock.calls[0]![1];

  it("first run: no re-score line, marker written with run=1 and first=this head", async () => {
    const t = await run({ result: result(0.76, "yellow", "human-review") });
    await t.promise;
    expect(rescoreOpts()).toEqual({});
    expect(t.scoreArgs().brief).toMatchObject({ firstHead: t.headSha, firstRun: 1 });
    expect(t.gh.comments[0]!.body).toContain(
      stateMarker({ head: t.headSha, first: t.headSha, firstRun: 1, score: 0.76, tier: "yellow", decision: "human-review", run: 1 }),
    );
    expect(t.gh.comments.some((c) => c.body.includes("Re-scored for"))).toBe(false);
    expect(t.gh.ops("createComment")).toHaveLength(1);
  });

  it("a push with the same outcome: shows the re-score line, bumps run, keeps the first run's first, posts the one-line notice", async () => {
    const t = await run({ result: result(0.76, "yellow", "human-review"), ownComment: () => stateMarker(prevState()) });
    await t.promise;
    expect(rescoreOpts()).toMatchObject({
      rescoreLine: `Re-scored for \`${t.headSha.slice(0, 7)}\` (run 2) · was 0.76 yellow → now 0.76 yellow`,
    });
    expect(t.scoreArgs().brief).toMatchObject({ firstHead: PREV_HEAD, firstRun: 1 });
    expect(t.gh.comments[0]!.body).toContain(
      stateMarker({ head: t.headSha, first: PREV_HEAD, firstRun: 1, score: 0.76, tier: "yellow", decision: "human-review", run: 2 }),
    );
    expect(t.gh.ops("createComment")).toHaveLength(1);
    expect(t.gh.comments[1]!.body).toBe(
      `opendrs: re-scored at ${t.headSha.slice(0, 7)} · 0.76 yellow · human-review · [see the updated report](${MAIN_COMMENT_LINK})`,
    );
  });

  it("on-change: a push with the same outcome posts no notice", async () => {
    const t = await run({
      result: result(0.76, "yellow", "human-review"),
      ownComment: () => stateMarker(prevState()),
      inputs: { notifyChanges: "on-change" },
    });
    await t.promise;
    expect(rescoreOpts()).toMatchObject({ rescoreLine: expect.stringContaining("Re-scored for") });
    expect(t.gh.ops("createComment")).toEqual([]);
  });

  it("on-change: a push that changes the tier posts the notice", async () => {
    const t = await run({
      result: result(0.28, "green", "auto-approve"),
      ownComment: () => stateMarker(prevState()),
      inputs: { notifyChanges: "on-change" },
    });
    await t.promise;
    expect(t.gh.comments.find((comment) => comment.body.includes("re-scored at"))?.body).toContain("0.28 green · auto-approve");
  });

  it("a previous 0.3.x marker (no first=): first becomes its head, firstRun becomes its run", async () => {
    const t = await run({
      result: result(0.76, "yellow", "human-review"),
      ownComment: () => `<!-- opendrs-state: v1 head=${PREV_HEAD} score=0.76 tier=yellow decision=human-review run=3 -->`,
    });
    await t.promise;
    expect(t.scoreArgs().brief).toMatchObject({ firstHead: PREV_HEAD, firstRun: 3 });
    expect(t.gh.comments[0]!.body).toContain(
      stateMarker({ head: t.headSha, first: PREV_HEAD, firstRun: 3, score: 0.76, tier: "yellow", decision: "human-review", run: 4 }),
    );
  });

  it("the run after a 0.3.x migration keeps firstRun from the marker instead of resetting to 1", async () => {
    // Simulates the marker the previous test's run would have written: first= and firstRun= already
    // carried over from the 0.3.x migration (run 3), one run later (run 4).
    const t = await run({
      result: result(0.76, "yellow", "human-review"),
      ownComment: () => stateMarker({ head: PREV_HEAD, first: PREV_HEAD, firstRun: 3, score: 0.76, tier: "yellow", decision: "human-review", run: 4 }),
    });
    await t.promise;
    expect(t.scoreArgs().brief).toMatchObject({ firstHead: PREV_HEAD, firstRun: 3 });
    expect(t.gh.comments[0]!.body).toContain(
      stateMarker({ head: t.headSha, first: PREV_HEAD, firstRun: 3, score: 0.76, tier: "yellow", decision: "human-review", run: 5 }),
    );
  });

  it("re-run on the same head commit (a label, a reopen) still bumps run and shows the line, but posts no notice", async () => {
    const t = await run({
      action: "labeled",
      result: result(0.76, "yellow", "human-review"),
      ownComment: (head) => stateMarker(prevState({ head })),
    });
    await t.promise;
    expect(rescoreOpts()).toMatchObject({ rescoreLine: expect.stringContaining(`(run 2)`) });
    expect(t.gh.ops("createComment")).toEqual([]);
  });

  it("re-run on the same head commit that changes the decision still posts the notice", async () => {
    const t = await run({
      action: "labeled",
      result: result(0.76, "yellow", "human-review"),
      ownComment: (head) => stateMarker(prevState({ head, decision: "waiting-ai-review" })),
    });
    await t.promise;
    expect(t.gh.comments.find((comment) => comment.body.includes("re-scored at"))?.body).toContain("0.76 yellow · human-review");
  });

  it("tier change: posts a short new comment linking to the report, without the main marker", async () => {
    const t = await run({ result: result(0.28, "green", "auto-approve"), ownComment: () => stateMarker(prevState()) });
    await t.promise;
    const notice = t.gh.comments.find((comment) => comment.body.includes("re-scored at"));
    expect(notice?.body).toBe(`opendrs: re-scored at ${t.headSha.slice(0, 7)} · 0.28 green · auto-approve · [see the updated report](${MAIN_COMMENT_LINK})`);
    expect(notice?.body).not.toContain(COMMENT_MARKER);
  });

  it("posts no change notice when the main comment could not be written", async () => {
    const t = await run({ result: result(0.28, "green", "auto-approve"), ownComment: () => stateMarker(prevState()), gh: { forbid: new Set(["updateComment"]) } });
    await t.promise;
    expect(t.gh.comments.some((c) => c.body.includes("re-scored at"))).toBe(false);
  });

  it("on-change: a decision-only change (same tier) also notifies", async () => {
    const t = await run({
      result: result(0.46, "yellow", "human-review"),
      ownComment: () => stateMarker(prevState({ score: 0.46, tier: "yellow", decision: "waiting-ai-review" })),
      inputs: { notifyChanges: "on-change" },
    });
    await t.promise;
    const notice = t.gh.comments.find((c) => c.body.includes("re-scored at"));
    expect(notice?.body).toContain("0.46 yellow · human-review");
  });

  it("ignores a forged state marker in a comment that is not opendrs's own: counts as first run", async () => {
    const forged = stateMarker({ head: "f".repeat(40), score: 0.9, tier: "red", decision: "human-review", run: 9 });
    const t = await run({ result: result(0.76, "yellow", "human-review") });
    t.gh.comments.push({ id: 5, body: `${COMMENT_MARKER}\n${forged}`, user: { login: "mallory", type: "User" } });
    await t.promise;
    expect(rescoreOpts()).toEqual({});
    expect(t.gh.comments.some((c) => c.body.includes("Re-scored for") || c.body.includes("re-scored at"))).toBe(false);
  });

  it("an invalid marker (bad sha, score, tier, run, or extra fields) counts as a first run", async () => {
    const t = await run({
      result: result(0.76, "yellow", "human-review"),
      ownComment: () => "<!-- opendrs-state: v1 head=short score=1.5 tier=purple decision=maybe run=0 -->",
    });
    await t.promise;
    expect(rescoreOpts()).toEqual({});
    expect(t.gh.comments.some((c) => c.body.includes("Re-scored for") || c.body.includes("re-scored at"))).toBe(false);
  });

  it("notify-changes off: still shows the re-score line but posts no notice", async () => {
    const t = await run({
      result: result(0.28, "green", "auto-approve"),
      ownComment: () => stateMarker(prevState()),
      inputs: { notifyChanges: "off" },
    });
    await t.promise;
    expect(rescoreOpts()).toMatchObject({ rescoreLine: expect.stringContaining("Re-scored for") });
    expect(t.gh.comments.some((c) => c.body.includes("re-scored at"))).toBe(false);
  });

  it("brief:false: no marker, no re-score line, no change notice", async () => {
    const t = await run({
      result: result(0.28, "green", "auto-approve"),
      ownComment: () => stateMarker(prevState()),
      inputs: { brief: false },
    });
    await t.promise;
    expect(rescoreOpts()).toEqual({});
    expect(t.gh.comments[0]!.body).not.toContain("opendrs-state");
    expect(t.gh.comments.some((c) => c.body.includes("re-scored at"))).toBe(false);
  });

  it("coexists with the landing-delay eligibility marker", async () => {
    const t = await run({
      baseConfig: { autoApprove: { enabled: true, landingDelayMinutes: 30 } },
      result: (() => {
        const r = result(0.12, "green", "auto-approve");
        r.policy.landingDelayMinutes = 30;
        return r;
      })(),
    });
    await t.promise;
    expect(t.gh.comments[0]!.body).toContain("opendrs-eligible");
    expect(t.gh.comments[0]!.body).toContain("opendrs-state");
  });
});

describe("labels", () => {
  it("sets the tier label and removes stale risk labels only", async () => {
    const t = await run({ labels: ["risk:green", "risk:red", "bug"], result: result(0.45, "yellow", "human-review") });
    await t.promise;
    expect(t.gh.ops("removeLabel").map((e) => decodeURIComponent(e.path.split("/").pop()!)).sort()).toEqual(["risk:green", "risk:red"]);
    expect(t.gh.ops("addLabels").map((e) => e.body)).toEqual([{ labels: ["risk:yellow"] }]);
    expect(t.gh.labels.sort()).toEqual(["bug", "risk:yellow"]);
  });

  it("makes no label calls when the label is already right", async () => {
    const t = await run({ labels: ["risk:green"] });
    await t.promise;
    expect(t.gh.ops("addLabels")).toEqual([]);
    expect(t.gh.ops("removeLabel")).toEqual([]);
  });

  it("skips labels when the input is false", async () => {
    const t = await run({ inputs: { labels: false } });
    await t.promise;
    expect(t.gh.ops("addLabels")).toEqual([]);
  });

  it("warns and continues when labelling is forbidden", async () => {
    const t = await run({ gh: { forbid: new Set(["addLabels"]) } });
    await expect(t.promise).resolves.toMatchObject({ tier: "green" });
    expect(t.log()).toMatch(/::warning::.*label/i);
  });
});

describe("captain", () => {
  const withCaptain = (priority: "careful" | "standard" | "quick", scored = result(0.1, "green", "auto-approve")): ScoreResult => ({
    ...scored,
    brief: { ...BRIEF, captain: { priority, why: [], facts: [], notes: [] } },
  });

  it("creates the captain:<priority> label with its colour", async () => {
    const t = await run({ result: withCaptain("careful") });
    await t.promise;
    expect(t.gh.labels).toContain("captain:careful");
    expect(t.gh.repoLabels["captain:careful"]).toEqual({ color: "d93f0b", description: "opendrs: captain should review carefully" });
  });

  it("swaps the stale captain label on a rerun with a different priority", async () => {
    const t = await run({ labels: ["captain:careful"], result: withCaptain("quick") });
    await t.promise;
    expect(t.gh.ops("removeLabel").map((e) => decodeURIComponent(e.path.split("/").pop()!))).toContain("captain:careful");
    expect(t.gh.labels).toContain("captain:quick");
    expect(t.gh.labels).not.toContain("captain:careful");
  });

  it("sets the captain output to the priority", async () => {
    const t = await run({ result: withCaptain("standard") });
    await t.promise;
    expect(t.output()).toMatch(/^captain<<(\S+)\nstandard\n\1$/m);
  });

  it("leaves the captain output empty, and adds no captain label, when the brief has no captain", async () => {
    const t = await run({ result: { ...result(0.1, "green", "auto-approve"), brief: BRIEF } });
    await t.promise;
    expect(t.output()).toMatch(/^captain<<(\S+)\n\n\1$/m);
    expect(t.gh.ops("addLabels").flatMap((e) => (e.body as { labels: string[] }).labels)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^captain:/)]));
  });

  it("shows the captain line and block in the job summary", async () => {
    const { renderMarkdown: real } = await vi.importActual<typeof import("../../src/report/markdown.js")>("../../src/report/markdown.js");
    vi.mocked(renderMarkdown).mockImplementationOnce(real).mockImplementationOnce(real);
    const brief = { ...BRIEF, captain: { priority: "careful" as const, why: [], facts: [{ id: "layers.edge" as const, weight: "strong" as const, file: "src/a.ts", text: "new import" }], notes: [] } };
    const t = await run({ result: { ...result(0.1, "green", "auto-approve"), brief } });
    await t.promise;
    expect(t.summary()).toContain("**Captain: careful review**");
    expect(t.summary()).toContain("**For the captain**");
    expect(t.summary()).toContain("- new import");
  });

  it("sets the captain reviewer to the same login the review request uses", async () => {
    const experts = (repo: TestRepo) => {
      for (const [n, login] of [["1", "ana"], ["2", "bo"], ["3", "cy"], ["4", "di"]]) {
        repo.commit({ "src/a.ts": `${n}\n` }, `fix ${n}`, { name: login!, email: `${n}0+${login}@users.noreply.github.com` });
      }
    };
    const t = await run({ before: experts, result: withCaptain("careful", result(0.6, "yellow", "human-review")) });
    await t.promise;
    const requested = t.gh.ops("requestReviewers").map((e) => e.body as { reviewers: string[] });
    expect(requested).toHaveLength(1);
    const [login] = requested[0]!.reviewers;
    const sentBrief = vi.mocked(renderMarkdown).mock.calls[0]![0].brief;
    expect(sentBrief?.captain?.reviewer).toBe(login);
  });
});
