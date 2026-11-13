import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, type TestRepo } from "../helpers/repo.js";
import { fakeResult } from "../cli/helpers.js";
import { installFakeGitHub } from "./fake-github.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/report/markdown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/report/markdown.js")>()),
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\nreport"),
}));

const { scoreDiff } = await import("../../src/engine.js");
const { readInputs, runFromEnv } = await import("../../src/action/env.js");

describe("readInputs", () => {
  it("applies the defaults", () => {
    expect(readInputs({ "INPUT_GITHUB-TOKEN": "t" })).toStrictEqual({
      token: "t",
      baseConfig: true,
      comment: true,
      labels: true,
      llmApiKey: undefined,
      sampleSalt: "",
      brief: true,
      notifyChanges: "every-push",
    });
  });

  it("parses YAML-style booleans and the LLM key", () => {
    expect(
      readInputs({ "INPUT_GITHUB-TOKEN": "t", "INPUT_BASE-CONFIG": "False", INPUT_COMMENT: "FALSE", INPUT_LABELS: "true", "INPUT_LLM-API-KEY": " k " }),
    ).toEqual({ token: "t", baseConfig: false, comment: false, labels: true, llmApiKey: "k", sampleSalt: "", brief: true, notifyChanges: "every-push" });
  });

  it("reads INPUT_NOTIFY-CHANGES, defaulting to every-push, with true and false kept from before", () => {
    const notifyChanges = (value?: string) =>
      readInputs({ "INPUT_GITHUB-TOKEN": "t", ...(value === undefined ? {} : { "INPUT_NOTIFY-CHANGES": value }) }).notifyChanges;
    expect(notifyChanges()).toBe("every-push");
    expect(notifyChanges("every-push")).toBe("every-push");
    expect(notifyChanges("on-change")).toBe("on-change");
    expect(notifyChanges("true")).toBe("every-push");
    expect(notifyChanges("TRUE")).toBe("every-push");
    expect(notifyChanges("false")).toBe("off");
    expect(notifyChanges(" False ")).toBe("off");
    expect(() => notifyChanges("sometimes")).toThrow(/notify-changes.*every-push, on-change, true or false/);
  });

  it("reads sample-salt", () => {
    expect(readInputs({ "INPUT_GITHUB-TOKEN": "t", "INPUT_SAMPLE-SALT": "pepper" }).sampleSalt).toBe("pepper");
  });

  it("reads INPUT_BRIEF, defaulting to true", () => {
    expect(readInputs({ "INPUT_GITHUB-TOKEN": "t" }).brief).toBe(true);
    expect(readInputs({ "INPUT_GITHUB-TOKEN": "t", INPUT_BRIEF: "false" }).brief).toBe(false);
  });

  it("rejects a non-boolean value", () => {
    expect(() => readInputs({ "INPUT_GITHUB-TOKEN": "t", INPUT_COMMENT: "yes" })).toThrow(/comment/);
  });

  it("requires a token", () => {
    expect(() => readInputs({})).toThrow(/github-token/);
  });
});

describe("runFromEnv", () => {
  let repo: TestRepo | undefined;
  afterEach(() => {
    repo?.cleanup();
    repo = undefined;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function setup() {
    repo = makeRepo();
    const base = repo.commit({ "a.ts": "1\n" }, "base");
    const head = repo.commit({ "a.ts": "2\n" }, "head");
    const eventPath = join(repo.dir, ".git", "event.json");
    writeFileSync(
      eventPath,
      JSON.stringify({
        pull_request: {
          number: 7,
          node_id: "PR_7",
          title: "t",
          body: null,
          labels: [],
          base: { sha: base, ref: "main", repo: { full_name: "o/r" } },
          head: { sha: head, ref: "f", repo: { full_name: "o/r" } },
        },
      }),
    );
    installFakeGitHub();
    let out = "";
    const env: NodeJS.ProcessEnv = {
      "INPUT_GITHUB-TOKEN": "t",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "o/r",
      GITHUB_WORKSPACE: repo.dir,
    };
    return { env, write: (s: string) => void (out += s), out: () => out };
  }

  it("returns 0 after a successful run", async () => {
    const t = setup();
    vi.mocked(scoreDiff).mockResolvedValue(fakeResult(0.2, "green", "human-review"));
    expect(await runFromEnv(t.env, t.write)).toBe(0);
    expect(t.out()).toContain("::group::Score");
  });

  it("returns 1 with an ::error:: on an operational error, without a stack trace", async () => {
    const t = setup();
    vi.mocked(scoreDiff).mockRejectedValue(new Error("git diff failed"));
    expect(await runFromEnv(t.env, t.write)).toBe(1);
    expect(t.out()).toContain("::error::git diff failed");
    expect(t.out()).not.toContain("    at ");
  });

  it("returns 1 when the event payload is missing", async () => {
    let out = "";
    expect(await runFromEnv({ "INPUT_GITHUB-TOKEN": "t", GITHUB_REPOSITORY: "o/r" }, (s) => void (out += s))).toBe(1);
    expect(out).toContain("::error::");
    expect(out).toContain("GITHUB_EVENT_PATH");
  });
});
