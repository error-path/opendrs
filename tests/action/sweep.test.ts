import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import type { ScoreResult } from "../../src/domain/types.js";
import { GitHubClient } from "../../src/action/github.js";
import { createWorkflowIO } from "../../src/action/workflow.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";
import { fakeResult } from "../cli/helpers.js";
import { API, BOT, installFakeGitHub, type FakeGitHub } from "./fake-github.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/report/markdown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/report/markdown.js")>()),
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\n## Risk report"),
}));

const { scoreDiff } = await import("../../src/engine.js");
const { COMMENT_MARKER, LANDING_LABEL } = await import("../../src/action/run.js");
const { HOLD_LABEL, eligibleMarker } = await import("../../src/action/approval.js");
const { listLabelledPulls, runSweep } = await import("../../src/action/sweep.js");
const { runFromEnv } = await import("../../src/action/env.js");

const DELAYED = { autoApprove: { enabled: true, landingDelayMinutes: 30 } };

let origin: TestRepo | undefined;
let checkout: string | undefined;
afterEach(() => {
  origin?.cleanup();
  if (checkout) rmSync(checkout, { recursive: true, force: true });
  origin = checkout = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function delayed(): ScoreResult {
  const r = fakeResult(0.12, "green", "auto-approve");
  r.policy.mergeMethod = "auto-merge";
  r.policy.landingDelayMinutes = 30;
  return r;
}

/** A node of the GraphQL `pullRequests` connection for PR `number` on head `head`. */
const node = (number: number, base: string, head: string, author = { login: "octocat", __typename: "User" }, labels = [LANDING_LABEL]) => ({
  number,
  id: `PR_${number}`,
  title: `PR ${number}`,
  body: null,
  isDraft: false,
  author,
  labels: { nodes: labels.map((name) => ({ name })) },
  baseRefOid: base,
  baseRefName: "main",
  baseRepository: { nameWithOwner: "o/r" },
  headRefOid: head,
  headRefName: "feature",
  headRepository: { nameWithOwner: "o/r" },
});

const page = (nodes: unknown[], endCursor: string | null = null) =>
  new Response(JSON.stringify({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } } } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Answer the sweep's `pullRequests` query from `pages` (one per call) and leave everything else to the fake GitHub. */
function answerPulls(pages: Response[]): Array<Record<string, unknown>> {
  const inner = globalThis.fetch;
  const queries: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const body = init.body ? (JSON.parse(String(init.body)) as { query?: string; variables?: Record<string, unknown> }) : undefined;
    if (body?.query?.includes("pullRequests(")) {
      queries.push(body.variables ?? {});
      return pages.shift() ?? page([]);
    }
    return inner(input, init);
  });
  return queries;
}

/**
 * A PR #7 on `origin` reachable only as refs/pull/7/head, and a clone of origin's main as the job's
 * checkout; `numbers` are the PRs the sweep lists, all pointing at that head and carrying `labels`.
 * With `baseMoves`, main gains a commit on origin after the clone, as a push during the sweep would.
 */
function setup(numbers: number[], gh: Partial<FakeGitHub> = {}, { labels = [LANDING_LABEL], baseMoves = false } = {}) {
  origin = makeRepo();
  let baseSha = origin.commit({ "src/a.ts": "1\n", ".opendrs.yml": stringify(DELAYED) }, "base");
  origin.git("checkout", "-q", "-b", "feature");
  const headSha = origin.commit({ "src/a.ts": "2\n" }, "change");
  origin.git("checkout", "-q", "main");
  origin.git("update-ref", "refs/pull/7/head", headSha);
  origin.git("branch", "-D", "feature");
  checkout = mkdtempSync(join(tmpdir(), "opendrs-sweep-"));
  execFileSync("git", ["clone", "-q", origin.dir, checkout]);
  if (baseMoves) baseSha = origin.commit({ "src/b.ts": "1\n" }, "base moves");

  const fake = installFakeGitHub({ labels, headSha, commits: [{ sha: headSha, author: { login: "octocat" }, commit: { author: { email: "octocat@example.com" } } }], ...gh });
  const queries = answerPulls([page(numbers.map((n) => node(n, baseSha, headSha, undefined, labels)))]);
  vi.mocked(scoreDiff).mockResolvedValue(delayed());
  let log = "";
  const io = createWorkflowIO({}, (s) => void (log += s));
  const client = new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" });
  const deps = {
    repoDir: checkout,
    event: { schedule: "*/15 * * * *" },
    inputs: { token: "t", baseConfig: true, comment: true, labels: true, brief: true, notifyChanges: "every-push" as const },
    client,
    io,
    env: {},
    owner: "o",
    repo: "r",
  };
  return { deps, gh: fake, queries, baseSha, headSha, log: () => log };
}

describe("runSweep", () => {
  it("fetches each labelled PR's head and re-runs the PR flow, going on past one that fails, then fails the job", async () => {
    const t = setup([8, 7]);
    await expect(runSweep(t.deps)).rejects.toThrow(/1 of 2 PR\(s\) failed: #8/);
    expect(t.queries).toEqual([{ owner: "o", name: "r", label: LANDING_LABEL, after: null }]);
    expect(t.log()).toMatch(/::error::PR #8: git fetch failed/);
    // PR #8 has no refs/pull/8/head; PR #7's head arrives only through the fetch and still gets scored.
    expect(vi.mocked(scoreDiff).mock.calls.map((c) => c[0].head)).toEqual([t.headSha]);
    expect(t.gh.ops("createComment")).toHaveLength(1);
    expect(t.gh.comments[0]!.body).toContain(`<!-- opendrs-eligible: ${t.headSha} `);
  });

  it("approves a PR whose delay has run and removes opendrs:landing", async () => {
    const since = new Date(Date.now() - 31 * 60_000);
    const t = setup([7]);
    t.gh.comments.push({ id: 2, body: `${COMMENT_MARKER}\nold\n${eligibleMarker(t.headSha, since)}`, user: BOT });
    await expect(runSweep(t.deps)).resolves.toBeUndefined();
    expect(t.gh.ops("createReview")).toHaveLength(1);
    expect(t.gh.labels).not.toContain(LANDING_LABEL);
  });

  it("skips a PR on hold instead of re-scoring it; removing the hold label resumes it through the unlabeled event", async () => {
    const t = setup([7], {}, { labels: [LANDING_LABEL, HOLD_LABEL] });
    await expect(runSweep(t.deps)).resolves.toBeUndefined();
    expect(scoreDiff).not.toHaveBeenCalled();
    expect(t.log()).toMatch(new RegExp(`PR #7.*${HOLD_LABEL}`));
  });

  it("fetches the base branch too, so a push to it during the sweep does not leave the base commit missing", async () => {
    const t = setup([7], {}, { baseMoves: true });
    await expect(runSweep(t.deps)).resolves.toBeUndefined();
    expect(vi.mocked(scoreDiff).mock.calls.map((c) => c[0].base)).toEqual([t.baseSha]);
  });

  it("does nothing when no open PR carries the label", async () => {
    const t = setup([]);
    await expect(runSweep(t.deps)).resolves.toBeUndefined();
    expect(scoreDiff).not.toHaveBeenCalled();
    expect(t.log()).toContain(`No open PRs labelled ${LANDING_LABEL}`);
  });
});

describe("listLabelledPulls", () => {
  it("follows the pages and maps the nodes to the pull_request payload shape", async () => {
    installFakeGitHub();
    const bot = { login: "dependabot", __typename: "Bot" };
    const queries = answerPulls([page([node(1, "b".repeat(40), "h".repeat(40))], "CURSOR"), page([node(2, "b".repeat(40), "h".repeat(40), bot)])]);
    const client = new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" });
    const pulls = await listLabelledPulls(client, "o", "r", LANDING_LABEL);
    expect(queries.map((q) => q.after)).toEqual([null, "CURSOR"]);
    expect(pulls.map((p) => p.number)).toEqual([1, 2]);
    expect(pulls[0]).toEqual({
      number: 1,
      node_id: "PR_1",
      title: "PR 1",
      body: null,
      labels: [{ name: LANDING_LABEL }],
      draft: false,
      user: { login: "octocat", type: "User" },
      base: { sha: "b".repeat(40), ref: "main", repo: { full_name: "o/r" } },
      head: { sha: "h".repeat(40), ref: "feature", repo: { full_name: "o/r" } },
    });
    expect(pulls[1]!.user).toEqual({ login: "dependabot", type: "Bot" });
  });
});

describe("runFromEnv", () => {
  it("sweeps instead of scoring on a schedule event", async () => {
    const t = setup([]);
    const eventPath = join(t.deps.repoDir, ".git", "event.json");
    writeFileSync(eventPath, JSON.stringify({ schedule: "*/15 * * * *" }));
    let out = "";
    const env = { "INPUT_GITHUB-TOKEN": "t", GITHUB_EVENT_NAME: "schedule", GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "o/r", GITHUB_WORKSPACE: t.deps.repoDir };
    expect(await runFromEnv(env, (s) => void (out += s))).toBe(0);
    expect(out).toContain(`No open PRs labelled ${LANDING_LABEL}`);
  });
});
