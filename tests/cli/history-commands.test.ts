import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacktestMetrics, ModelWeights } from "../../src/domain/types.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";
import { testIo } from "./helpers.js";

vi.mock("../../src/model/calibrate.js", () => ({ calibrate: vi.fn() }));
vi.mock("../../src/model/backtest.js", () => ({ backtest: vi.fn() }));
vi.mock("../../src/engine.js", () => ({ scoreDiff: vi.fn(), loadModel: vi.fn() }));

const { calibrate } = await import("../../src/model/calibrate.js");
const { backtest } = await import("../../src/model/backtest.js");
const { loadModel } = await import("../../src/engine.js");
const { runCli } = await import("../../src/cli/cli.js");

const metrics = (c5: number, c10: number, c50: number, auc: number): BacktestMetrics => ({
  commits: 500,
  positives: 40,
  baseRate: 0.08,
  capturedAt: { "5": c5, "10": c10, "50": c50 },
  auc,
});

const MODEL: ModelWeights = {
  version: 1,
  intercept: -2.5,
  weights: { "size.churn": 0.4 },
  trainedOn: { commits: 500, positives: 40, from: "2025-10-01", to: "2026-10-01" },
  metrics: metrics(0.2, 0.31, 0.88, 0.74),
};

let repo: TestRepo;
beforeEach(() => {
  repo = makeRepo();
  repo.commit({ "a.ts": "1\n" }, "init");
  vi.mocked(calibrate).mockResolvedValue({ model: MODEL, warnings: [] });
});
afterEach(() => {
  repo.cleanup();
  vi.clearAllMocks();
});

describe("opendrs calibrate", () => {
  it("writes the model to config.model, creating the directory", async () => {
    const t = testIo(repo.dir);
    expect(await runCli(["calibrate"], t.io)).toBe(0);
    expect(JSON.parse(readFileSync(join(repo.dir, ".opendrs/model.json"), "utf8"))).toEqual(MODEL);
  });

  it.each(["../../escaped.json", "/tmp/escaped.json", "models/../../escaped.json"])("refuses a model path that leaves the repository (%s)", async (modelPath) => {
    writeFileSync(join(repo.dir, ".opendrs.yml"), `model: ${modelPath}\n`);
    const cliOutput = testIo(repo.dir);
    expect(await runCli(["calibrate"], cliOutput.io)).not.toBe(0);
    expect(cliOutput.stderr()).toMatch(/inside the repository/);
  });

  // A directory junction needs no privilege on Windows; elsewhere "junction" makes a plain symlink.
  it("refuses to write the model into a .opendrs folder that is a symbolic link", async () => {
    const outside = mkdtempSync(join(tmpdir(), "opendrs-outside-"));
    try {
      symlinkSync(outside, join(repo.dir, ".opendrs"), "junction");
      const cliOutput = testIo(repo.dir);
      expect(await runCli(["calibrate"], cliOutput.io)).not.toBe(0);
      expect(cliOutput.stderr()).toMatch(/symbolic link/);
      expect(existsSync(join(outside, "model.json"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("honours a custom model path from .opendrs.yml", async () => {
    writeFileSync(join(repo.dir, ".opendrs.yml"), "model: models/drs/model.json\n");
    await runCli(["calibrate"], testIo(repo.dir).io);
    expect(JSON.parse(readFileSync(join(repo.dir, "models/drs/model.json"), "utf8"))).toEqual(MODEL);
  });

  it("passes --since and --max-commits through", async () => {
    await runCli(["calibrate", "--since", "2026-01-01", "--max-commits", "300"], testIo(repo.dir).io);
    expect(vi.mocked(calibrate).mock.calls[0]![0]).toMatchObject({ since: "2026-01-01", maxCommits: 300 });
  });

  it("uses history.labelHorizonDays from .opendrs.yml, overridden by --label-horizon-days", async () => {
    writeFileSync(join(repo.dir, ".opendrs.yml"), "history:\n  labelHorizonDays: 30\n");
    await runCli(["calibrate"], testIo(repo.dir).io);
    await runCli(["calibrate", "--label-horizon-days", "0"], testIo(repo.dir).io);
    const calls = vi.mocked(calibrate).mock.calls;
    expect(calls[0]![0].config.history.labelHorizonDays).toBe(30);
    expect(calls[1]![0].config.history.labelHorizonDays).toBe(0);
  });

  it.each(["-1", "1.5", "soon", ""])("rejects --label-horizon-days %s", async (v) => {
    const t = testIo(repo.dir);
    expect(await runCli(["calibrate", `--label-horizon-days=${v}`], t.io)).toBe(2);
    expect(t.stderr()).toContain("--label-horizon-days must be a non-negative integer");
    expect(calibrate).not.toHaveBeenCalled();
  });

  it.each(["0", "-5", "1.5", "lots"])("rejects --max-commits %s", async (v) => {
    expect(await runCli(["calibrate", "--max-commits", v], testIo(repo.dir).io)).toBe(2);
    expect(calibrate).not.toHaveBeenCalled();
  });

  it("rejects --brief: it is not a calibrate option", async () => {
    const t = testIo(repo.dir);
    expect(await runCli(["calibrate", "--brief"], t.io)).toBe(2);
    expect(t.stderr()).toContain("--brief");
    expect(calibrate).not.toHaveBeenCalled();
  });

  it("prints captured@5/10/50 and AUC", async () => {
    const t = testIo(repo.dir);
    await runCli(["calibrate"], t.io);
    expect(t.stdout()).toContain("500 commits (40 positive)");
    expect(t.stdout()).toMatch(/@5%\s+20\.0 %/);
    expect(t.stdout()).toMatch(/@10%\s+31\.0 %/);
    expect(t.stdout()).toMatch(/@50%\s+88\.0 %/);
    expect(t.stdout()).toContain("AUC 0.74");
  });

  it("prints replay warnings (skipped commits, unresolved incidents) to stderr", async () => {
    vi.mocked(calibrate).mockResolvedValue({ model: MODEL, warnings: ["3 commits skipped (unreadable)"] });
    const t = testIo(repo.dir);
    expect(await runCli(["calibrate"], t.io)).toBe(0);
    expect(t.stderr()).toContain("warning: 3 commits skipped (unreadable)");
  });

  it("says when metrics are missing", async () => {
    vi.mocked(calibrate).mockResolvedValue({ model: { version: 1, intercept: 0, weights: {} }, warnings: [] });
    const t = testIo(repo.dir);
    expect(await runCli(["calibrate"], t.io)).toBe(0);
    expect(t.stdout()).toContain("no held-out metrics");
  });
});

describe("opendrs backtest", () => {
  beforeEach(() => {
    vi.mocked(backtest).mockResolvedValue({
      default: metrics(0.12, 0.2, 0.7, 0.64),
      calibrated: metrics(0.2, 0.31, 0.88, 0.74),
      curve: [[0, 0], [1, 1]],
      notes: [],
    });
  });

  it("passes the calibrated model when one exists", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    await runCli(["backtest"], testIo(repo.dir).io);
    expect(vi.mocked(backtest).mock.calls[0]![0].model).toBe(MODEL);
  });

  it("passes no model when only the default priors exist", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: { version: 1, intercept: -3, weights: {} }, kind: "default" });
    vi.mocked(backtest).mockResolvedValue({ default: metrics(0.12, 0.2, 0.7, 0.64), curve: [], notes: [] });
    const t = testIo(repo.dir);
    await runCli(["backtest", "--since", "2026-01-01"], t.io);
    expect(vi.mocked(backtest).mock.calls[0]![0]).toMatchObject({ model: undefined, since: "2026-01-01" });
    expect(t.stdout()).toContain("opendrs calibrate");
  });

  it("passes --label-horizon-days through as the config's horizon", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    await runCli(["backtest", "--label-horizon-days", "90"], testIo(repo.dir).io);
    expect(vi.mocked(backtest).mock.calls[0]![0].config.history.labelHorizonDays).toBe(90);
  });

  it("prints a table with both models and labelled Meta reference numbers", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    const t = testIo(repo.dir);
    expect(await runCli(["backtest"], t.io)).toBe(0);
    const out = t.stdout();
    expect(out).toMatch(/default priors\s+12\.0 %\s+20\.0 %\s+70\.0 %\s+0\.64/);
    expect(out).toMatch(/calibrated.*\s+20\.0 %\s+31\.0 %\s+88\.0 %\s+0\.74/);
    expect(out).toMatch(/Meta.*18\.7 %\s+27\.9 %\s+84\.6 %/);
    expect(out).toContain("Meta's in-house results");
    expect(out).toContain("not comparable");
  });

  it("prints the default priors on the calibrated model's held-out commits as an extra row", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    vi.mocked(backtest).mockResolvedValue({
      default: metrics(0.12, 0.2, 0.7, 0.64),
      calibrated: metrics(0.2, 0.31, 0.88, 0.74),
      defaultOnHeldOut: metrics(0.1, 0.15, 0.6, 0.61),
      curve: [],
      notes: [],
    });
    const t = testIo(repo.dir);
    await runCli(["backtest"], t.io);
    expect(t.stdout()).toMatch(/calibrated \(held-out\)\s+20\.0 %\s+31\.0 %\s+88\.0 %\s+0\.74/);
    expect(t.stdout()).toMatch(/default priors \(held-out\)\s+10\.0 %\s+15\.0 %\s+60\.0 %\s+0\.61/);
  });

  it("does not claim the calibrated model is missing when it has no held-out commits", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    vi.mocked(backtest).mockResolvedValue({ default: metrics(0.12, 0.2, 0.7, 0.64), curve: [], notes: ["No replayed commit is newer"] });
    const t = testIo(repo.dir);
    await runCli(["backtest"], t.io);
    expect(t.stdout()).not.toContain("No calibrated model");
    expect(t.stdout()).toContain("Note: No replayed commit is newer");
  });

  it("prints calibrate's recorded held-out metrics as a labelled row when there are no newer commits", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    vi.mocked(backtest).mockResolvedValue({ default: metrics(0.12, 0.2, 0.7, 0.64), recorded: metrics(0.2, 0.31, 0.88, 0.74), curve: [], notes: [] });
    const t = testIo(repo.dir);
    await runCli(["backtest"], t.io);
    expect(t.stdout()).toMatch(/calibrated \(recorded\)\s+20\.0 %\s+31\.0 %\s+88\.0 %\s+0\.74/);
    expect(t.stdout()).toContain("recorded: calibrate's held-out evaluation");
  });

  it("prints the raw report with --json", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    const t = testIo(repo.dir);
    await runCli(["backtest", "--json"], t.io);
    expect(JSON.parse(t.stdout()).calibrated.auc).toBe(0.74);
  });

  it("backtest --brief passes brief through and prints the focus hit rate alongside the capture table", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    vi.mocked(backtest).mockResolvedValue({
      default: metrics(0.12, 0.2, 0.7, 0.64),
      curve: [],
      notes: [],
      focusHitRate: { commits: 10, hits: 6, hitRate: 0.6, changedLineShare: 0.25, skipped: 0 },
    });
    const t = testIo(repo.dir);
    await runCli(["backtest", "--brief"], t.io);
    expect(vi.mocked(backtest).mock.calls[0]![0]).toMatchObject({ brief: true });
    expect(t.stdout()).toMatch(/[Ff]ocus hit rate/);
  });

  it("backtest --brief --json includes focusHitRate", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    vi.mocked(backtest).mockResolvedValue({
      default: metrics(0.12, 0.2, 0.7, 0.64),
      curve: [],
      notes: [],
      focusHitRate: { commits: 10, hits: 6, hitRate: 0.6, changedLineShare: 0.25, skipped: 0 },
    });
    const t = testIo(repo.dir);
    await runCli(["backtest", "--brief", "--json"], t.io);
    expect(JSON.parse(t.stdout()).focusHitRate).toBeDefined();
  });

  it("backtest --brief notes how many SZZ-labelled commits could not be measured", async () => {
    vi.mocked(loadModel).mockResolvedValue({ model: MODEL, kind: "calibrated" });
    vi.mocked(backtest).mockResolvedValue({
      default: metrics(0.12, 0.2, 0.7, 0.64),
      curve: [],
      notes: [],
      focusHitRate: { commits: 0, hits: 0, hitRate: 0, changedLineShare: 0, skipped: 3 },
    });
    const t = testIo(repo.dir);
    await runCli(["backtest", "--brief"], t.io);
    expect(t.stdout()).toMatch(/3 .*could not be measured/);
  });
});
