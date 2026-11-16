import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../../src/domain/config.js";
import { type TestRepo } from "../helpers/repo.js";
import { stringify } from "yaml";
import { renderMarkdown, ENABLED, PR_EMAIL, prCommit, result, run } from "./run-harness.js";

vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn() }));
vi.mock("../../src/report/markdown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/report/markdown.js")>()),
  renderMarkdown: vi.fn(() => "<!-- opendrs -->\n## Risk report"),
}));
describe("author verification", () => {
  it("trusts the head commit's author when GitHub maps it to the PR's account", async () => {
    const t = await run();
    await t.promise;
    expect(t.gh.ops("listCommits")).toHaveLength(1);
    expect(t.scoreArgs().authorVerified).toBe(true);
  });

  it.each([
    ["belongs to another account (a faked maintainer email)", (sha: string) => [prCommit(sha, "maintainer", "maintainer@example.com")]],
    ["has no GitHub account", (sha: string) => [prCommit(sha, null, "maintainer@example.com")]],
    ["is not the last listed commit (over 250 commits)", (sha: string) => [prCommit(sha), prCommit("f".repeat(40))]],
  ])("does not trust the author when the head commit %s", async (_, commits) => {
    const t = await run({ gh: { commits: [] } });
    t.gh.commits = commits(t.headSha);
    await t.promise;
    expect(t.scoreArgs().authorVerified).toBe(false);
    expect(t.log()).toMatch(/not verified/);
  });

  it("does not trust the author, with a warning, when the PR's commits cannot be read", async () => {
    const t = await run({ gh: { forbid: new Set(["listCommits"]) } });
    await t.promise;
    expect(t.scoreArgs().authorVerified).toBe(false);
    expect(t.log()).toMatch(/::warning::.*commits/);
  });

  const reviewersShown = () => vi.mocked(renderMarkdown).mock.calls[0]![0].policy.suggestedReviewers;
  const history = (repo: TestRepo) => {
    repo.commit({ "src/a.ts": "0\n" }, "maintainer", { name: "M", email: "maintainer@example.com" });
    repo.commit({ "src/a.ts": "00\n" }, "octocat", { name: "O", email: PR_EMAIL });
  };

  it("suggests reviewers without excluding a faked head-commit email, and never suggests the PR's author", async () => {
    const t = await run({ before: history, gh: { commits: [] } });
    // The head commit claims the maintainer's email; an earlier commit is verified as the PR author's.
    t.gh.commits = [prCommit("e".repeat(40)), prCommit(t.headSha, "maintainer", "maintainer@example.com")];
    await t.promise;
    expect(reviewersShown()).toContain("maintainer@example.com");
    expect(reviewersShown()).not.toContain(PR_EMAIL);
  });

  it("excludes the PR author's verified email from suggested reviewers", async () => {
    const t = await run({ before: history });
    await t.promise;
    expect(reviewersShown()).toContain("maintainer@example.com");
    expect(reviewersShown()).not.toContain(PR_EMAIL);
  });

  it("requests a review from exactly one expert's GitHub login when a human must review", async () => {
    const experts = (repo: TestRepo) => {
      for (const [n, login] of [["1", "ana"], ["2", "bo"], ["3", "cy"], ["4", "di"]]) {
        repo.commit({ "src/a.ts": `${n}\n` }, `fix ${n}`, { name: login!, email: `${n}0+${login}@users.noreply.github.com` });
      }
    };
    const t = await run({ before: experts, result: result(0.6, "yellow", "human-review") });
    await t.promise;
    const requested = t.gh.ops("requestReviewers").map((e) => e.body as { reviewers: string[] });
    expect(requested).toHaveLength(1);
    expect(requested[0]!.reviewers).toHaveLength(1);
    const [login] = requested[0]!.reviewers;
    // The three most recent committers tie on score; "ana", the oldest, is outside the top three.
    expect(["bo", "cy", "di"]).toContain(login);
    expect(t.gh.comments[0]!.body).toContain(`**Reviewer:** @${login} (one of the top experts, picked at random so the work spreads)`);
  });

  it("requests no review when the PR lands without a human", async () => {
    const t = await run({ before: (repo) => repo.commit({ "src/a.ts": "0\n" }, "fix", { name: "ana", email: "ana@users.noreply.github.com" }) });
    await t.promise;
    expect(t.gh.ops("requestReviewers")).toHaveLength(0);
  });

  const ana = (repo: TestRepo, message = "tidy") => repo.commit({ "src/a.ts": "0\n" }, message, { name: "ana", email: "ana@users.noreply.github.com" });

  it("picks the reviewer among the experts with a GitHub login, so an email-only expert does not leave the PR without one", async () => {
    const t = await run({
      before: (repo) => {
        repo.commit({ "src/a.ts": "x\n" }, "tidy", { name: "X", email: "x@example.com" });
        ana(repo);
      },
      result: result(0.6, "yellow", "human-review"),
    });
    await t.promise;
    expect(t.gh.ops("requestReviewers").map((e) => e.body)).toEqual([{ reviewers: ["ana"] }]);
  });

  it("does not re-request a review from an expert who has already reviewed the PR", async () => {
    const t = await run({
      before: ana,
      result: result(0.6, "yellow", "human-review"),
      gh: { reviews: [{ id: 3, body: "looks fine", state: "COMMENTED", user: { login: "ana", type: "User" }, commit_id: "old" }] },
    });
    await t.promise;
    expect(t.gh.ops("requestReviewers")).toEqual([]);
    expect(t.gh.comments[0]!.body).not.toContain("**Reviewer:**");
  });

  it("ranks the authors of fix commits higher for a yellow or red PR, as the gate does", async () => {
    const t = await run({
      before: (repo) => {
        ana(repo, "fix: crash on empty input");
        repo.commit({ "src/a.ts": "00\n" }, "tidy", { name: "bo", email: "bo@users.noreply.github.com" });
      },
      result: result(0.6, "yellow", "human-review"),
    });
    await t.promise;
    expect(reviewersShown()[0]).toBe("ana@users.noreply.github.com");
    expect(t.gh.ops("requestReviewers").map((e) => e.body)).toEqual([{ reviewers: ["ana"] }]);
  });

  it("leaves the comment, labels and reviewer request to the run for the new head when the head moved while scoring", async () => {
    const t = await run({ before: ana, result: result(0.6, "yellow", "human-review") });
    t.gh.headSha = "f".repeat(40);
    await expect(t.promise).resolves.toMatchObject({ approved: false, decision: "human-review" });
    expect(t.gh.ops("createComment")).toEqual([]);
    expect(t.gh.ops("addLabels")).toEqual([]);
    expect(t.gh.ops("requestReviewers")).toEqual([]);
    expect(t.log()).toMatch(/::notice::.*head moved/);
  });
});

describe("base-branch config", () => {
  it("reads .opendrs.yml from the base commit, ignoring the PR's edits to it", async () => {
    const t = await run({
      baseConfig: { thresholds: { green: 0.25 } },
      headFiles: { ".opendrs.yml": stringify({ thresholds: { green: 0.9 }, autoApprove: { enabled: true } }) },
    });
    await t.promise;
    expect(t.scoreArgs().config.thresholds.green).toBe(0.25);
    expect(t.scoreArgs().config.autoApprove.enabled).toBe(false);
  });

  it("uses the defaults when the base has no .opendrs.yml, even if the PR adds one", async () => {
    const t = await run({ baseConfig: null, headFiles: { ".opendrs.yml": stringify(ENABLED) } });
    await t.promise;
    expect(t.scoreArgs().config.autoApprove.enabled).toBe(false);
    expect(t.gh.ops("createReview")).toEqual([]);
  });

  it("reads the checked-out config when base-config is false, with a warning", async () => {
    const t = await run({ baseConfig: { thresholds: { green: 0.25 } }, headFiles: { ".opendrs.yml": stringify({ thresholds: { green: 0.5 } }) }, inputs: { baseConfig: false } });
    await t.promise;
    expect(t.scoreArgs().config.thresholds.green).toBe(0.5);
    expect(t.log()).toMatch(/::warning::.*base-config/);
  });

  it("takes llm and model from the base config even when base-config is false, so a PR cannot redirect the key", async () => {
    const evil = { llm: { enabled: true, baseUrl: "https://attacker.example", apiKeyEnv: "STOLEN" }, model: "evil.json", thresholds: { green: 0.5 } };
    const t = await run({ baseConfig: ENABLED, headFiles: { ".opendrs.yml": stringify(evil) }, inputs: { baseConfig: false, llmApiKey: "sk-test" } });
    await t.promise;
    const config = t.scoreArgs().config;
    expect(config.thresholds.green).toBe(0.5); // the rest still comes from the PR checkout
    expect(config.llm).toEqual(defaultConfig().llm);
    expect(config.model).toBe(defaultConfig().model);
    expect(t.env.STOLEN).toBeUndefined();
    expect(t.env.ANTHROPIC_API_KEY).toBe("sk-test");
  });

  it("fails on an invalid base config", async () => {
    const t = await run({ baseConfig: { thresholds: { green: "high" } } });
    await expect(t.promise).rejects.toThrow(/Invalid \.opendrs\.yml/);
  });

  it("scores with the calibrated model from the base commit", async () => {
    const model = { version: 1, intercept: -2, weights: { "size.churn": 0.5 } };
    const t = await run({ baseFiles: { ".opendrs/model.json": JSON.stringify(model) }, headFiles: { "src/a.ts": "2\n" } });
    await t.promise;
    expect(t.scoreArgs().model).toEqual(model);
  });

  it("passes no model when the base has none", async () => {
    const t = await run();
    await t.promise;
    expect(t.scoreArgs().model).toBeUndefined();
  });

  it.each([
    [{}, "ANTHROPIC_API_KEY"],
    [{ llm: { provider: "openai" } }, "OPENAI_API_KEY"],
    [{ llm: { provider: "openai", apiKeyEnv: "AZURE_KEY" } }, "AZURE_KEY"],
  ])("exports llm-api-key for config %j as %s", async (cfg, name) => {
    const t = await run({ baseConfig: cfg, inputs: { llmApiKey: "sk-test" } });
    await t.promise;
    expect(t.env[name]).toBe("sk-test");
  });
});
