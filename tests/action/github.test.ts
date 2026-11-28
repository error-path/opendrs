import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClient, GitHubError, isSelf } from "../../src/action/github.js";
import { API, installFakeGitHub, type FakeGitHub } from "./fake-github.js";

const client = () =>
  new GitHubClient({ token: "tok", apiUrl: "https://ghe.example/api/v3", graphqlUrl: "https://ghe.example/api/graphql", owner: "o", repo: "r" });

const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("GitHubClient", () => {
  it("sends the token and API version, against the configured API URL", async () => {
    const fetch = vi.fn(async () => json(200, []));
    vi.stubGlobal("fetch", fetch);
    await client().listComments(7);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ghe.example/api/v3/repos/o/r/issues/7/comments?per_page=100");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", "x-github-api-version": "2022-11-28" });
  });

  it("follows Link rel=next pagination", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, [{ id: 1 }], { link: '<https://ghe.example/api/v3/next?page=2>; rel="next", <x>; rel="last"' }))
      .mockResolvedValueOnce(json(200, [{ id: 2 }]));
    vi.stubGlobal("fetch", fetch);
    expect((await client().listReviews(7)).map((r) => r.id)).toEqual([1, 2]);
    expect(fetch.mock.calls[1]![0]).toBe("https://ghe.example/api/v3/next?page=2");
  });

  const checkRun = (name: string, conclusion: string | null, over: Record<string, unknown> = {}) => ({
    name,
    head_sha: "abc",
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    app: { slug: "github-actions" },
    details_url: "https://github.com/o/r/actions/runs/41/job/1",
    ...over,
  });

  it("returns only successful check-run names across pages, asking for the latest run of each check", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, { check_runs: [checkRun("claude-review", "success"), checkRun("lint", "failure")] }, { link: '<https://ghe.example/api/v3/p2>; rel="next"' }),
      )
      .mockResolvedValueOnce(json(200, { check_runs: [checkRun("test", null), checkRun("build", "success")] }));
    vi.stubGlobal("fetch", fetch);
    expect((await client().successfulChecks("abc")).map((c) => c.name)).toEqual(["claude-review", "build"]);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("https://ghe.example/api/v3/repos/o/r/commits/abc/check-runs?filter=latest&per_page=100");
  });

  it("ignores check runs for any other commit than the one asked for", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { check_runs: [checkRun("claude-review", "success", { head_sha: "def" })] })));
    expect((await client().successfulChecks("abc")).map((c) => c.name)).toEqual([]);
  });

  it("never counts opendrs's own job: a check named like an unfinished Actions job of this workflow run", async () => {
    const own = { details_url: "https://github.com/o/r/actions/runs/42/job/9" };
    const runs = [
      checkRun("opendrs", null, own),
      checkRun("opendrs", "success"), // the same job in an earlier run for this commit
      checkRun("claude-review", "success", { details_url: "https://github.com/o/r/actions/runs/42/job/8" }),
      checkRun("other-app", "success", { app: { slug: "some-ci" } }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { check_runs: runs })));
    expect(await client().successfulChecks("abc", "42")).toEqual([
      { name: "claude-review", app: "github-actions" },
      { name: "other-app", app: "some-ci" },
    ]);
  });

  it("does not take another app's unfinished check for opendrs's own job", async () => {
    const runs = [
      checkRun("claude-review", null, { app: { slug: "some-ci" }, details_url: "https://github.com/o/r/actions/runs/42/job/9" }),
      checkRun("claude-review", "success"),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { check_runs: runs })));
    expect((await client().successfulChecks("abc", "42")).map((c) => c.name)).toEqual(["claude-review"]);
  });

  it("throws GitHubError carrying the HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(403, { message: "Resource not accessible by integration" })));
    const err = await client().createComment(7, "x").catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(403);
    expect(err.message).toContain("Resource not accessible by integration");
  });

  it("treats removing a label that is not there as success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(404, { message: "Label does not exist" })));
    await expect(client().removeLabel(7, "risk:red")).resolves.toBeUndefined();
  });

  it("URL-encodes label names", async () => {
    const fetch = vi.fn(async () => json(200, []));
    vi.stubGlobal("fetch", fetch);
    await client().removeLabel(7, "risk:red");
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("https://ghe.example/api/v3/repos/o/r/issues/7/labels/risk%3Ared");
  });

  describe("addLabels makes sure opendrs's labels exist with their colours", () => {
    const fakeClient = (init: Partial<FakeGitHub> = {}) => ({
      gh: installFakeGitHub(init),
      client: new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" }),
    });

    it("creates a missing label with its colour and description, URL-encoding the name, then adds it", async () => {
      const { gh, client } = fakeClient();
      await client.addLabels(7, ["risk:red"]);
      expect(gh.ops("getLabel").map((e) => e.path)).toEqual(["/repos/o/r/labels/risk%3Ared"]);
      expect(gh.ops("createLabel").map((e) => e.body)).toEqual([{ name: "risk:red", color: "d73a4a", description: expect.any(String) }]);
      expect(gh.labels).toEqual(["risk:red"]);
    });

    it("recolours a label GitHub auto-created in default grey", async () => {
      const { gh, client } = fakeClient({ repoLabels: { "opendrs:landing": { color: "ededed" } } });
      await client.addLabels(7, ["opendrs:landing"]);
      expect(gh.ops("updateLabel").map((e) => [e.path, e.body])).toEqual([["/repos/o/r/labels/opendrs%3Alanding", { color: "1d76db", description: expect.any(String) }]]);
      expect(gh.ops("createLabel")).toHaveLength(0);
      expect(gh.labels).toEqual(["opendrs:landing"]);
    });

    it("never overrides a colour the user chose", async () => {
      const { gh, client } = fakeClient({ repoLabels: { "risk:green": { color: "000000", description: "ours" } } });
      await client.addLabels(7, ["risk:green"]);
      expect(gh.ops("createLabel")).toHaveLength(0);
      expect(gh.ops("updateLabel")).toHaveLength(0);
      expect(gh.repoLabels["risk:green"]).toEqual({ color: "000000", description: "ours" });
      expect(gh.labels).toEqual(["risk:green"]);
    });

    it("still adds the label when creating it is refused (403)", async () => {
      const { gh, client } = fakeClient({ forbid: new Set(["createLabel"]) });
      await client.addLabels(7, ["risk:yellow"]);
      expect(gh.ops("createLabel")).toHaveLength(1);
      expect(gh.labels).toEqual(["risk:yellow"]);
    });

    it("checks each label once per client and leaves other labels alone", async () => {
      const { gh, client } = fakeClient();
      await client.addLabels(7, ["risk:red", "needs-docs"]);
      await client.addLabels(7, ["risk:red"]);
      expect(gh.ops("getLabel")).toHaveLength(1);
      expect(gh.ops("addLabels")).toHaveLength(2);
    });
  });

  it("maps a GraphQL FORBIDDEN error to status 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { errors: [{ type: "FORBIDDEN", message: "nope" }] })));
    const err = await client().enqueue("PR_1", "abc").catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(403);
  });

  it("gives every request a timeout, and a timed-out request fails as an error", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(client().listComments(7)).rejects.toThrow(/timeout/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to GET /user when the GraphQL viewer query fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, { errors: [{ type: "FORBIDDEN", message: "no viewer" }] }))
      .mockResolvedValueOnce(json(200, { login: "octo-bot" }));
    vi.stubGlobal("fetch", fetch);
    expect(await client().viewerLogin()).toBe("octo-bot");
  });

  it("reports an unknown identity when neither viewer nor /user can be read (installation token)", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, { errors: [{ type: "FORBIDDEN", message: "no viewer" }] }))
      .mockResolvedValueOnce(json(403, { message: "Resource not accessible by integration" }));
    vi.stubGlobal("fetch", fetch);
    expect(await client().viewerLogin()).toBeUndefined();
  });

  it.each([
    ["github-actions", { login: "github-actions[bot]", type: "Bot" }, true],
    ["GitHub-Actions[bot]", { login: "github-actions[bot]", type: "Bot" }, true],
    ["github-actions", { login: "github-actions", type: "User" }, true],
    ["github-actions", { login: "mallory", type: "Bot" }, false],
    [undefined, { login: "some-app[bot]", type: "Bot" }, false],
    [undefined, { login: "github-actions[bot]", type: "Bot" }, true],
    [undefined, { login: "alice", type: "User" }, false],
    [undefined, null, false],
  ] as const)("isSelf(%j, %j) is %s", (viewer, user, expected) => {
    expect(isSelf(user, viewer)).toBe(expected);
  });

  it("reads the base branch's pull_request rules and classic review protection, URL-encoding the branch", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, [
          { type: "deletion" },
          { type: "pull_request", parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true } },
        ]),
      )
      .mockResolvedValueOnce(json(200, { required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 1 } }));
    vi.stubGlobal("fetch", fetch);
    expect(await client().pullRequestRules("release/1.x")).toEqual([{ required_approving_review_count: 1, dismiss_stale_reviews_on_push: true }]);
    expect(await client().classicReviewProtection("release/1.x")).toEqual({ dismiss_stale_reviews: true, required_approving_review_count: 1 });
    const urls = fetch.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls).toEqual([
      "https://ghe.example/api/v3/repos/o/r/rules/branches/release%2F1.x?per_page=100",
      "https://ghe.example/api/v3/repos/o/r/branches/release%2F1.x/protection",
    ]);
  });

  it("picks the first allowed merge method and reports the merge queue", async () => {
    const fetch = vi.fn(async () =>
      json(200, { data: { repository: { mergeCommitAllowed: false, squashMergeAllowed: true, rebaseMergeAllowed: true, mergeQueue: { id: "MQ" } } } }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await client().mergeSettings("main")).toEqual({ hasMergeQueue: true, method: "SQUASH" });
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.variables).toEqual({ owner: "o", name: "r", branch: "main" });
  });
});
