import { describe, expect, it, vi } from "vitest";
import { scoreDiff, renderMarkdown, COMMENT_MARKER, APPROVAL_MARKER, LANDING_LABEL, eligibleMarker, result, run, SELF_CHECK_MARKER } from "./run-harness.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/report/markdown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/report/markdown.js")>()),
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\n## Risk report"),
}));
describe("dismissal", () => {
  const review = (id: number, login: string, body: string, state = "APPROVED") => ({
    id,
    body,
    state,
    user: { login, type: login.endsWith("[bot]") ? ("Bot" as const) : ("User" as const) },
    commit_id: "old",
  });

  it("dismisses only its own earlier approval when risk rises", async () => {
    const t = await run({
      result: result(0.4512, "yellow", "human-review"),
      gh: {
        reviews: [
          review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`),
          review(2, "alice", `${APPROVAL_MARKER}\nquoting the bot`),
          review(3, "github-actions[bot]", "approved by another workflow"),
          review(4, "github-actions[bot]", `${APPROVAL_MARKER}\nold`, "DISMISSED"),
        ],
      },
    });
    await t.promise;
    expect(t.gh.ops("dismissReview").map((e) => [e.path, e.body])).toEqual([
      ["/repos/o/r/pulls/7/reviews/1/dismissals", { message: "Risk increased: yellow 0.45", event: "DISMISS" }],
    ]);
  });

  it("gives the policy's reason, not a risk increase, when a green PR is held back (e.g. a freeze)", async () => {
    const held = result(0.12, "green", "human-review");
    held.policy.reasons = ['freeze "weekend": auto-approval suspended'];
    const t = await run({ result: held, gh: { reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] } });
    await t.promise;
    expect(t.gh.ops("dismissReview").map((e) => e.body)).toEqual([
      { message: 'opendrs approval withdrawn: freeze "weekend": auto-approval suspended', event: "DISMISS" },
    ]);
  });

  it("when the token identity is unknown, dismisses only marked approvals by a bot", async () => {
    const t = await run({
      result: result(0.4512, "yellow", "human-review"),
      gh: {
        forbid: new Set(["viewer"]),
        reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`), review(2, "alice", `${APPROVAL_MARKER}\nquoting the bot`)],
      },
    });
    await t.promise;
    expect(t.gh.ops("dismissReview").map((e) => e.path)).toEqual(["/repos/o/r/pulls/7/reviews/1/dismissals"]);
  });

  it("also disables auto-merge and leaves the merge queue when it withdraws its approval", async () => {
    const t = await run({
      result: result(0.4512, "yellow", "human-review"),
      inputs: { sampleSalt: "s" },
      gh: { reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] },
    });
    await t.promise;
    expect(t.gh.ops("disableAutoMerge").map((e) => e.body)).toEqual([{ id: "PR_node7" }]);
    expect(t.gh.ops("dequeue").map((e) => e.body)).toEqual([{ id: "PR_node7" }]);
    expect(t.log()).not.toContain("::warning::");
  });

  it.each(["Pull request is not in a merge queue", "Can't disable auto-merge for this pull request because it is not enabled"])(
    "ignores the '%s' error when withdrawing",
    async (message) => {
      const t = await run({
        result: result(0.4512, "yellow", "human-review"),
        inputs: { sampleSalt: "s" },
        gh: { mergeStateError: message, reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] },
      });
      await t.promise;
      expect(t.gh.ops("disableAutoMerge")).toHaveLength(1);
      expect(t.gh.ops("dequeue")).toHaveLength(1);
      expect(t.log()).not.toContain("::warning::");
    },
  );

  it("warns and carries on when disabling auto-merge fails for another reason", async () => {
    const t = await run({
      result: result(0.4512, "yellow", "human-review"),
      gh: { fail: new Set(["disableAutoMerge"]), reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] },
    });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.log()).toMatch(/::warning::.*auto-merge/);
    expect(t.gh.ops("dequeue")).toHaveLength(1);
  });

  it("leaves auto-merge alone when it has no approval to withdraw (a human may have enabled it)", async () => {
    const t = await run({ result: result(0.4512, "yellow", "human-review") });
    await t.promise;
    expect(t.gh.ops("disableAutoMerge")).toEqual([]);
    expect(t.gh.ops("dequeue")).toEqual([]);
  });

  it("fails closed: on an error after the PR is known, withdraws its approval and auto-merge, then fails", async () => {
    const t = await run({ gh: { reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] } });
    vi.mocked(scoreDiff).mockRejectedValue(new Error("git diff failed"));
    await expect(t.promise).rejects.toThrow("git diff failed");
    expect(t.gh.ops("dismissReview")).toHaveLength(1);
    expect(t.gh.ops("disableAutoMerge")).toHaveLength(1);
    expect(t.gh.ops("dequeue")).toHaveLength(1);
  });

  it("fails closed when its reviews cannot be listed: does not score, stops auto-merge and keeps the original error", async () => {
    const t = await run({ gh: { fail: new Set(["listReviews"]) } });
    await expect(t.promise).rejects.toThrow("GitHub GET /repos/o/r/pulls/7/reviews failed: 500");
    expect(scoreDiff).not.toHaveBeenCalled();
    expect(t.gh.ops("disableAutoMerge")).toHaveLength(1);
    expect(t.gh.ops("dequeue")).toHaveLength(1);
  });

  it("withdraws its approval when the guard trips on a later push", async () => {
    const t = await run({
      headFiles: { ".github/workflows/x.yml": "x\n" },
      gh: { reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] },
    });
    await t.promise;
    expect(t.gh.ops("dismissReview")).toHaveLength(1);
  });

  it("warns and continues when the dismissal is forbidden", async () => {
    const t = await run({
      result: result(0.7, "red", "human-review"),
      gh: { forbid: new Set(["dismissReview"]), reviews: [review(1, "github-actions[bot]", `${APPROVAL_MARKER}\nok`)] },
    });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.log()).toMatch(/::warning::.*dismiss/i);
  });
});

describe("landing delay", () => {
  const DELAYED = { autoApprove: { enabled: true, landingDelayMinutes: 30 } };
  const delayed = () => {
    const r = result(0.12, "green", "auto-approve");
    r.policy.landingDelayMinutes = 30;
    return r;
  };
  const markerFor = (head: string, minutesAgo: number) => eligibleMarker(head, new Date(Date.now() - minutesAgo * 60_000));
  const removed = (t: Awaited<ReturnType<typeof run>>) => t.gh.ops("removeLabel").map((e) => decodeURIComponent(e.path.split("/").pop()!));

  it("holds a fresh eligible PR: no approval, an eligibility marker for the head in its comment, and the opendrs:landing label", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed() });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.gh.comments[0]!.body).toMatch(new RegExp(`<!-- opendrs-eligible: ${t.headSha} \\S+ -->`));
    expect(t.gh.comments[0]!.body).toContain("approves at");
    expect(t.gh.labels).toContain(LANDING_LABEL);
  });

  it("approves once the delay has run since its own comment's marker, keeps the marker and removes opendrs:landing", async () => {
    const since = new Date(Date.now() - 31 * 60_000);
    const t = await run({ baseConfig: DELAYED, result: delayed(), labels: [LANDING_LABEL], ownComment: (head) => eligibleMarker(head, since) });
    await expect(t.promise).resolves.toMatchObject({ approved: true });
    expect(t.gh.ops("createReview")).toHaveLength(1);
    expect(t.gh.comments[0]!.body).toContain(eligibleMarker(t.headSha, since));
    expect(removed(t)).toContain(LANDING_LABEL);
    expect(t.gh.labels).not.toContain(LANDING_LABEL);
  });

  it("restarts the delay when the marker belongs to another head commit", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), labels: [LANDING_LABEL], ownComment: () => markerFor("a".repeat(40), 31) });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.comments[0]!.body).toContain(`<!-- opendrs-eligible: ${t.headSha} `);
    expect(t.gh.comments[0]!.body).not.toContain("a".repeat(40));
    expect(t.gh.ops("removeLabel")).toEqual([]);
  });

  it("ignores a marker in someone else's comment", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed() });
    t.gh.comments.push({ id: 9, body: `${COMMENT_MARKER}\n${markerFor(t.headSha, 31)}`, user: { login: "mallory", type: "User" } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
  });

  it("removes opendrs:landing and writes no marker when the PR is no longer eligible", async () => {
    const t = await run({ baseConfig: DELAYED, result: result(0.7, "red", "human-review"), labels: [LANDING_LABEL] });
    await t.promise;
    expect(removed(t)).toContain(LANDING_LABEL);
    expect(t.gh.comments[0]!.body).not.toContain("opendrs-eligible");
  });

  it("passes the PR's labels to the approval: opendrs:hold stops the delay but keeps opendrs:landing, so the sweep resumes it", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), labels: ["opendrs:hold", LANDING_LABEL], ownComment: (head) => markerFor(head, 31) });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.comments[0]!.body).toContain("on hold");
    expect(removed(t)).not.toContain(LANDING_LABEL);
  });

  it("ignores a marker older than the comment that carries it (a copied marker cannot backdate the clock)", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), ownComment: (head) => markerFor(head, 120), ownCommentCreated: new Date().toISOString() });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.comments[0]!.body).toContain("approves at");
  });

  const created = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  it("ignores a marker more than two minutes older than the comment that carries it", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), ownComment: (head) => markerFor(head, 40), ownCommentCreated: created(35) });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.comments[0]!.body).toContain("approves at");
  });

  it("trusts a marker written within two minutes before its comment", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), ownComment: (head) => markerFor(head, 36), ownCommentCreated: created(35) });
    await expect(t.promise).resolves.toMatchObject({ approved: true });
  });

  it("does not approve or set opendrs:landing when the comment input is false: the delay has nowhere to keep its clock", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), inputs: { comment: false } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.gh.ops("createReview")).toEqual([]);
    expect(t.gh.labels).not.toContain(LANDING_LABEL);
    expect(t.log()).toContain("landing delay needs the comment input");
  });

  it("sets opendrs:landing even when the labels input is false", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), inputs: { labels: false } });
    await t.promise;
    expect(t.gh.labels).toEqual([LANDING_LABEL]);
  });

  it("warns and carries on when the landing label cannot be set", async () => {
    const t = await run({ baseConfig: DELAYED, result: delayed(), gh: { forbid: new Set(["addLabels"]) } });
    await expect(t.promise).resolves.toMatchObject({ approved: false });
    expect(t.log()).toMatch(/::warning::.*opendrs:landing/);
  });
});


describe("self-check advisory line", () => {
  function briefResult(facts: Array<{ file: string }> = []) {
    const r = result(0.12, "green", "auto-approve");
    r.brief = {
      version: 1,
      verdict: { tier: "green", score: 0.12, decision: "auto-approve", why: "ok" },
      reviewFirst: [],
      checks: [],
      skim: [],
      human: [],
      notRanked: { hunks: 0, files: 0 },
      budget: { maxTokens: 2500, estimatedTokens: 10, truncated: false, omitted: { files: 0, hunks: 0, checks: 0, notes: 0 } },
      notes: [],
      captain: { priority: "standard", why: [], facts: facts.map((f) => ({ id: "coupling.missing" as const, weight: "info" as const, file: f.file, text: `missing co-change for ${f.file}` })), notes: [] },
    };
    return r;
  }

  it("renders addressed/explained counts when the head commit carries a matching record", async () => {
    const t = await run({
      result: briefResult([{ file: "src/b.ts" }]),
      headMessage: `change\n\n${SELF_CHECK_MARKER('[{"id":"coupling.missing:src/b.ts","verdict":"explained","note":"config-only"}]')}`,
    });
    await t.promise;
    const call = vi.mocked(renderMarkdown).mock.calls.find((c) => c[1]?.selfCheckLine);
    expect(call?.[1]?.selfCheckLine).toBe("author agent self-checked: 0 facts addressed, 1 explained · not part of the review decision");
  });

  it("omits selfCheckLine when the head commit carries no marker", async () => {
    const t = await run({ result: briefResult([{ file: "src/b.ts" }]), headMessage: "change" });
    await t.promise;
    for (const call of vi.mocked(renderMarkdown).mock.calls) expect(call[1]?.selfCheckLine).toBeUndefined();
  });

  it("reads the marker from the exact head commit, not an ancestor (a push that drops it reads as no self-check)", async () => {
    // This earlier commit stands in for "an ancestor that once carried a marker"; the actual head
    // (the `change` commit the run() helper creates) carries no marker of its own.
    const t = await run({
      result: briefResult([{ file: "src/b.ts" }]),
      before: (r) => {
        r.commit({ "src/a.ts": "0\n" }, `earlier commit\n\n${SELF_CHECK_MARKER('[{"id":"coupling.missing:src/b.ts","verdict":"fixed"}]')}`);
      },
      headMessage: "change", // the real head: no marker
    });
    await t.promise;
    for (const call of vi.mocked(renderMarkdown).mock.calls) expect(call[1]?.selfCheckLine).toBeUndefined();
  });

  it("never changes the Action's returned score/tier/decision, with or without a (forged) marker", async () => {
    const plainRun = await run({ result: result(0.5, "yellow", "human-review"), headMessage: "change" });
    const outcomePlain = await plainRun.promise;

    const markedRun = await run({
      result: result(0.5, "yellow", "human-review"),
      headMessage: `change\n\n${SELF_CHECK_MARKER('[{"id":"fake","verdict":"fixed","note":"decision=auto-approve"}]')}`,
    });
    const outcomeMarked = await markedRun.promise;
    expect(outcomeMarked).toEqual(outcomePlain);
  });
});
