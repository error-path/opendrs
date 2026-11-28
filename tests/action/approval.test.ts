import { afterEach, describe, expect, it, vi } from "vitest";
import type { Decision, ScoreResult, Tier } from "../../src/domain/types.js";
import { parseConfig } from "../../src/domain/config.js";
import { GitHubClient } from "../../src/action/github.js";
import type { PullRequest } from "../../src/action/run.js";
import type { WorkflowIO } from "../../src/action/workflow.js";
import { APPROVAL_MARKER, ELIGIBLE_MARKER, eligibleMarker, readEligibleSince, reconcileApproval, type ApprovalInput } from "../../src/action/approval.js";
import { stateMarker } from "../../src/action/state.js";
import { fakeResult } from "../cli/helpers.js";
import { API, BOT, installFakeGitHub, type FakeGitHub } from "./fake-github.js";

const HEAD = "h".repeat(40);
const NOW = new Date("2026-10-16T14:00:00Z");

afterEach(() => vi.unstubAllGlobals());

function result(decision: Decision, o: { delay?: number; reviewers?: string[]; tier?: Tier } = {}): ScoreResult {
  const r = fakeResult(0.34, o.tier ?? (decision === "auto-approve" ? "green" : "yellow"), decision);
  r.policy.mergeMethod = "none";
  r.policy.landingDelayMinutes = o.delay ?? 0;
  r.policy.suggestedReviewers = o.reviewers ?? [];
  return r;
}

const pr = (): PullRequest => ({
  number: 7,
  node_id: "PR_node7",
  title: "Add a thing",
  body: null,
  labels: [],
  base: { sha: "b".repeat(40), ref: "main", repo: { full_name: "o/r" } },
  head: { sha: HEAD, ref: "feature", repo: { full_name: "o/r" } },
});

function io(): WorkflowIO & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    info: () => {},
    notice: () => {},
    warning: (m) => void warnings.push(m),
    error: () => {},
    group: (_name, fn) => fn(),
    setOutput: () => {},
    summary: () => {},
  };
}

/** An earlier opendrs approval of `commit`, as the fake GitHub lists it. */
const ownApproval = (commit = HEAD) => ({ id: 1, body: `${APPROVAL_MARKER}\nApproved by opendrs`, state: "APPROVED", user: BOT, commit_id: commit });

function setup(res: ScoreResult, o: { gh?: Partial<FakeGitHub>; labels?: string[]; eligibleSince?: Date; now?: Date; commentEnabled?: boolean } = {}) {
  const gh = installFakeGitHub({ headSha: HEAD, ...o.gh });
  const client = new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" });
  const log = io();
  const input: ApprovalInput = {
    client,
    io: log,
    pr: pr(),
    config: parseConfig({ autoApprove: { enabled: true } }),
    result: res,
    files: ["src/a.ts"],
    viewer: "github-actions",
    now: o.now ?? NOW,
    eligibleSince: o.eligibleSince,
    labels: o.labels ?? [],
    commentEnabled: o.commentEnabled ?? true,
  };
  return { gh, io: log, run: () => reconcileApproval(input) };
}

describe("eligibility marker", () => {
  it("round-trips through the comment body for the same head", () => {
    const marker = eligibleMarker(HEAD, NOW);
    expect(marker).toBe(`<!-- ${ELIGIBLE_MARKER}: ${HEAD} 2026-10-16T14:00:00.000Z -->`);
    expect(readEligibleSince(`<!-- opendrs -->\n## Risk report\n${marker}`, HEAD)).toEqual(NOW);
  });

  it("reads the marker for this head even when a forged one for another sha comes first in the body", () => {
    const forged = `<!-- ${ELIGIBLE_MARKER}: ${"a".repeat(40)} 2020-01-01T00:00:00.000Z -->`;
    // A path rendered as inline code keeps < and >, so a PR-controlled file name can carry a marker.
    expect(readEligibleSince(`<!-- opendrs -->\n- \`src/${forged}.ts\`\n${eligibleMarker(HEAD, NOW)}`, HEAD)).toEqual(NOW);
  });

  it("ignores a forged marker for this head earlier in the body when opendrs wrote none", () => {
    const forged = `<!-- ${ELIGIBLE_MARKER}: ${HEAD} 2020-01-01T00:00:00.000Z -->`;
    expect(readEligibleSince(`<!-- opendrs -->
- \`src/${forged}.ts\`
${forged}

**Auto-approval:** not approved`, HEAD)).toBeUndefined();
  });

  it("reads opendrs's own trailer marker, also when the state marker follows it", () => {
    const forged = `<!-- ${ELIGIBLE_MARKER}: ${HEAD} 2020-01-01T00:00:00.000Z -->`;
    const state = stateMarker({ head: HEAD, first: HEAD, firstRun: 1, score: 0.1, tier: "green", decision: "auto-approve", run: 1 });
    expect(readEligibleSince(`<!-- opendrs -->
${forged}
**Auto-approval:** approves at 14:30 UTC
${eligibleMarker(HEAD, NOW)}
${state}`, HEAD)).toEqual(NOW);
  });

  it("ignores a marker for another head, a malformed time and a missing body", () => {
    expect(readEligibleSince(eligibleMarker("a".repeat(40), NOW), HEAD)).toBeUndefined();
    expect(readEligibleSince(`<!-- ${ELIGIBLE_MARKER}: ${HEAD} yesterday -->`, HEAD)).toBeUndefined();
    expect(readEligibleSince(undefined, HEAD)).toBeUndefined();
  });
});

describe("reconcileApproval", () => {
  it("approves a deferred-review decision like an auto-approve, with a deferred approval body", async () => {
    const { gh, run } = setup(result("deferred-review"));
    const out = await run();
    expect(out.approved).toBe(true);
    expect(out.status).toMatch(/^approved by opendrs \(deferred review: /);
    expect(gh.ops("createReview")).toHaveLength(1);
    expect((gh.ops("createReview")[0]!.body as { body: string }).body).toContain("deferred review");
    expect(gh.labels).toContain("opendrs:review-after-merge");
  });

  it("still blocks human-review decisions and withdraws its own approval", async () => {
    const { gh, run } = setup(result("human-review"), { gh: { reviews: [ownApproval()] } });
    const out = await run();
    expect(out).toEqual({ approved: false, status: "not approved: decision is human-review." });
    expect(gh.ops("dismissReview")).toHaveLength(1);
  });

  it("requests reviews only from suggested reviewers with a GitHub noreply email", async () => {
    const reviewers = ["123+alice@users.noreply.github.com", "bob@users.noreply.github.com", "carol@example.com"];
    const { gh, run } = setup(result("deferred-review", { reviewers }));
    const out = await run();
    expect(gh.ops("requestReviewers").map((e) => e.body)).toEqual([{ reviewers: ["alice", "bob"] }]);
    expect(out.status).toContain("review requested from alice, bob");
  });

  it("does not re-request reviews when this head is already approved (a rerun or sweep)", async () => {
    const reviewers = ["123+alice@users.noreply.github.com"];
    const { gh, run } = setup(result("deferred-review", { reviewers }), { gh: { reviews: [ownApproval()] } });
    const out = await run();
    expect(out.approved).toBe(true);
    expect(gh.ops("requestReviewers")).toHaveLength(0);
  });

  it("says so when no suggested reviewer maps to a GitHub login", async () => {
    const { gh, run } = setup(result("deferred-review", { reviewers: ["carol@example.com"] }));
    const out = await run();
    expect(gh.ops("requestReviewers")).toHaveLength(0);
    expect(out.approved).toBe(true);
    expect(out.status).toContain("no GitHub login among the suggested reviewers");
  });

  it("treats a refused review request or label as a warning, not a failure", async () => {
    const { gh, io, run } = setup(result("deferred-review", { reviewers: ["bob@users.noreply.github.com"] }), {
      gh: { reject: new Set(["requestReviewers"]), forbid: new Set(["addLabels"]) },
    });
    const out = await run();
    expect(out.approved).toBe(true);
    expect(gh.ops("createReview")).toHaveLength(1);
    expect(io.warnings.join("\n")).toMatch(/request.*422/);
    expect(io.warnings.join("\n")).toMatch(/label.*403/);
  });

  it("holds an eligible PR with the opendrs:hold label and withdraws its own approval", async () => {
    const since = new Date("2026-10-16T13:00:00Z");
    const { gh, run } = setup(result("auto-approve"), { labels: ["opendrs:hold"], eligibleSince: since, gh: { reviews: [ownApproval()] } });
    const out = await run();
    expect(out).toEqual({ approved: false, status: "on hold (opendrs:hold label)", eligibleSince: since });
    expect(gh.ops("dismissReview")).toHaveLength(1);
    expect(gh.ops("createReview")).toHaveLength(0);
  });

  it("starts the landing delay clock on the first eligible run and withdraws any early approval", async () => {
    const { gh, run } = setup(result("auto-approve", { delay: 30 }), { gh: { reviews: [ownApproval()] } });
    const out = await run();
    expect(out).toEqual({
      approved: false,
      status: "approves at 14:30 UTC unless someone requests changes, pushes, or adds opendrs:hold",
      eligibleSince: NOW,
      pendingUntil: new Date("2026-10-16T14:30:00Z"),
    });
    expect(gh.ops("dismissReview")).toHaveLength(1);
    expect(gh.ops("createReview")).toHaveLength(0);
  });

  it("keeps the earlier clock while the delay is still running", async () => {
    const since = new Date("2026-10-16T13:50:00Z");
    const { run } = setup(result("auto-approve", { delay: 30 }), { eligibleSince: since });
    const out = await run();
    expect(out.approved).toBe(false);
    expect(out.eligibleSince).toEqual(since);
    expect(out.pendingUntil).toEqual(new Date("2026-10-16T14:20:00Z"));
  });

  it("approves once the delay has elapsed", async () => {
    const since = new Date("2026-10-16T13:00:00Z");
    const { gh, run } = setup(result("auto-approve", { delay: 30 }), { eligibleSince: since });
    const out = await run();
    expect(out.approved).toBe(true);
    expect(out.status).toBe("approved by opendrs.");
    expect(out.eligibleSince).toEqual(since);
    expect(out.pendingUntil).toBeUndefined();
    expect(gh.ops("createReview")).toHaveLength(1);
  });

  it("blocks a landing delay when the comment input is off: the clock has nowhere to live", async () => {
    const { gh, run } = setup(result("auto-approve", { delay: 30 }), { commentEnabled: false, gh: { reviews: [ownApproval()] } });
    const out = await run();
    expect(out).toEqual({ approved: false, status: "not approved: landing delay needs the comment input." });
    expect(gh.ops("dismissReview")).toHaveLength(1);
  });

  it("does not start the clock for an ineligible PR", async () => {
    const { run } = setup(result("auto-approve", { delay: 30 }), { gh: { headSha: "moved" } });
    const out = await run();
    expect(out.approved).toBe(false);
    expect(out.eligibleSince).toBeUndefined();
  });
});
