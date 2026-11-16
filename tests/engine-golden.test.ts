import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultConfig } from "../src/domain/config.js";
import { scoreDiff } from "../src/engine.js";
import { scoreGoldenPullRequest } from "./helpers/golden-scoring.js";

// tests/fixtures/golden-full-score.json was written by origin/main's engine before scoreDiff took a
// supplied diff (see the fork comments design, section 4). Full mode must still give exactly that.
// To regenerate it on purpose, run scoreGoldenPullRequest against the build you trust and write
// its output to the file.

describe("scoreDiff in full mode", () => {
  it("gives exactly the result the engine gave before the fork-scoring options existed", async () => {
    const golden = readFileSync(new URL("./fixtures/golden-full-score.json", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(await scoreGoldenPullRequest(scoreDiff, defaultConfig())).toBe(golden);
  });
});
