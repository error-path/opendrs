import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../../src/domain/config.js";
import { loadModel } from "../../src/engine.js";
import { DEFAULT_WEIGHTS } from "../../src/model/defaults.js";
import { MAX_MODEL_COEFFICIENT, parseModelWeights } from "../../src/model/schema.js";

/** A small valid model; each test changes one field of it. */
const validModel = () => ({
  version: 1,
  intercept: -2.5,
  weights: { "size.churn": 0.3, "lang.ts": 0.1, "llm.semantic": 0.8 },
  priors: { "blast.dependents": 2.4 },
  percentiles: { "50": 0.08, "90": 0.31, "99": 0.7 },
  trainedOn: { commits: 500, positives: 60, from: "2025-01-01", to: "2026-01-01" },
});

/**
 * Parses a model given as an object.
 * @param model - The model object, written out as JSON.
 * @returns What {@link parseModelWeights} returns for it.
 */
const parseModelObject = (model: unknown) => parseModelWeights(JSON.stringify(model));

describe("parseModelWeights", () => {
  it("accepts a valid model, the default weights, and keeps the descriptive fields", () => {
    const parsed = parseModelObject(validModel());
    expect(parsed).toEqual({ model: validModel() });
    expect(parseModelObject(DEFAULT_WEIGHTS)).toEqual({ model: DEFAULT_WEIGHTS });
  });

  it.each([
    ["text that is not JSON", "{ not a model", "not valid JSON"],
    ["a JSON array", "[]", "value"],
    ["another version", JSON.stringify({ ...validModel(), version: 2 }), "version"],
    ["a missing intercept", JSON.stringify({ ...validModel(), intercept: undefined }), "intercept"],
    ["missing weights", JSON.stringify({ ...validModel(), weights: undefined }), "weights"],
    ["a weight that is a string", JSON.stringify({ ...validModel(), weights: { "size.churn": "0.3" } }), "weights"],
    ["a huge weight", JSON.stringify({ ...validModel(), weights: { "size.churn": 1e6 } }), "weights"],
    ["a huge intercept", JSON.stringify({ ...validModel(), intercept: -1e6 }), "intercept"],
    ["an unknown signal id", JSON.stringify({ ...validModel(), weights: { "size.made_up": 1 } }), "weights"],
    ["an unknown signal id in priors", JSON.stringify({ ...validModel(), priors: { "size.made_up": 1 } }), "priors"],
    ["a negative llm.* weight", JSON.stringify({ ...validModel(), weights: { "llm.risk.security": -3 } }), "weights"],
    ["a percentile score above 1", JSON.stringify({ ...validModel(), percentiles: { "50": 0.1, "90": 1.5 } }), "percentiles"],
    ["a percentile key that is not a number", JSON.stringify({ ...validModel(), percentiles: { median: 0.1 } }), "percentiles"],
    ["percentile scores out of order", JSON.stringify({ ...validModel(), percentiles: { "50": 0.9, "90": 0.1 } }), "percentiles"],
  ])("rejects %s, naming the field", (_, text, field) => {
    const parsed = parseModelWeights(text);
    expect(parsed).toHaveProperty("problem");
    if ("problem" in parsed) expect(parsed.problem).toContain(field);
  });

  it("accepts weights at the bound and rejects them just past it", () => {
    expect(parseModelObject({ ...validModel(), intercept: -MAX_MODEL_COEFFICIENT })).toHaveProperty("model");
    expect(parseModelObject({ ...validModel(), intercept: -MAX_MODEL_COEFFICIENT - 0.01 })).toHaveProperty("problem");
  });

  it("never repeats the file's own text in the problem", () => {
    const parsed = parseModelObject({ ...validModel(), weights: { "<script>alert(1)</script>": 1 } });
    expect(parsed).toHaveProperty("problem");
    if ("problem" in parsed) expect(parsed.problem).not.toContain("script");
  });
});

describe("loadModel", () => {
  let repoDir: string | undefined;
  afterEach(() => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
    repoDir = undefined;
  });

  /**
   * Makes a directory holding a model file at the config's default path.
   * @param modelText - The model file's contents.
   * @returns The directory.
   */
  const repoWithModel = (modelText: string): string => {
    repoDir = mkdtempSync(join(tmpdir(), "opendrs-model-"));
    mkdirSync(join(repoDir, ".opendrs"));
    writeFileSync(join(repoDir, ".opendrs", "model.json"), modelText);
    return repoDir;
  };

  it("uses a valid model, as calibrated", async () => {
    const loaded = await loadModel(repoWithModel(JSON.stringify(validModel())), defaultConfig());
    expect(loaded).toEqual({ model: validModel(), kind: "calibrated" });
  });

  it("falls back to the default weights, with a problem, for a model with a huge weight", async () => {
    const loaded = await loadModel(repoWithModel(JSON.stringify({ ...validModel(), weights: { "size.churn": 1e6 } })), defaultConfig());
    expect(loaded.model).toBe(DEFAULT_WEIGHTS);
    expect(loaded.kind).toBe("default");
    expect(loaded.problem).toMatch(/^\.opendrs\/model\.json is not a valid model \(.*weights.*\); it is ignored$/);
  });

  it("falls back to the default weights, with no problem, when there is no model file", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "opendrs-model-"));
    expect(await loadModel(repoDir, defaultConfig())).toEqual({ model: DEFAULT_WEIGHTS, kind: "default" });
  });
});
