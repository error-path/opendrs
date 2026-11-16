import { describe, expect, it } from "vitest";
import { OpendrsError } from "../../src/domain/types.js";
import {
  FORK_RESULT_MAX_BYTES,
  FORK_RESULT_MAX_SIGNALS,
  KNOWN_SIGNAL_IDS,
  buildForkResult,
  buildTooLargeResult,
  parseForkResult,
  serializeForkResult,
} from "../../src/report/fork-result.js";
import { fakeResult } from "../cli/helpers.js";

const HEAD_SHA = "a".repeat(40);

/** A result every check accepts; each test changes one thing about it. */
const validScored = () => ({
  v: 1,
  status: "scored",
  head: HEAD_SHA,
  opendrs: "0.5.2",
  score: 0.4321,
  tier: "yellow",
  model: "default",
  signals: [
    { id: "size.churn", value: 4.2, contribution: 1.05 },
    { id: "llm.risk.logic_bug", value: 1, contribution: 0.6 },
  ],
  counts: { files: 3, added: 120, deleted: 4, unknowns: 1 },
});

const validTooLarge = () => ({ v: 1, status: "too-large", head: HEAD_SHA, opendrs: "0.5.2", reason: "files", limit: 2000 });

/** Parses `value` after one change, so a test names only what it breaks. */
const parseWith = (change: (result: Record<string, unknown>) => void, start: () => Record<string, unknown> = validScored) => {
  const result = start();
  change(result);
  return () => parseForkResult(JSON.stringify(result));
};

describe("parseForkResult", () => {
  it("accepts a valid scored result and returns exactly its fields", () => {
    expect(parseForkResult(JSON.stringify(validScored()))).toStrictEqual(validScored());
  });

  it("accepts a valid too-large result", () => {
    expect(parseForkResult(JSON.stringify(validTooLarge()))).toStrictEqual(validTooLarge());
  });

  it("accepts a 64-character (SHA-256) head and the boundary scores 0 and 1", () => {
    expect(parseWith((result) => (result.head = "b".repeat(64)))).not.toThrow();
    expect(parseWith((result) => (result.score = 0))).not.toThrow();
    expect(parseWith((result) => (result.score = 1))).not.toThrow();
  });

  it("throws a usage OpendrsError", () => {
    expect(() => parseForkResult("{")).toThrow(OpendrsError);
  });

  it.each([
    ["an empty input", ""],
    ["text that is not JSON", "score: 0.1"],
    ["a JSON array", "[]"],
    ["a JSON string", '"scored"'],
    ["null", "null"],
  ])("rejects %s", (_, text) => {
    expect(() => parseForkResult(text)).toThrow(/not a valid opendrs fork result/);
  });

  it("rejects an input over the size cap before parsing it", () => {
    const padded = `${JSON.stringify(validScored())}${" ".repeat(FORK_RESULT_MAX_BYTES)}`;
    expect(() => parseForkResult(padded)).toThrow(/larger than/);
  });

  it("counts the size cap in bytes, not characters", () => {
    // 2000 three-byte characters: under the cap as characters, over it as UTF-8.
    expect(() => parseForkResult("€".repeat(2000))).toThrow(/larger than/);
  });

  it.each([
    ["a missing version", (result: Record<string, unknown>) => delete result.v],
    ["an unknown version", (result: Record<string, unknown>) => (result.v = 2)],
    ["an unknown status", (result: Record<string, unknown>) => (result.status = "approved")],
    ["an unknown top-level key", (result: Record<string, unknown>) => (result.decision = "auto-approve")],
    ["a comment body smuggled in as a key", (result: Record<string, unknown>) => (result.body = "@everyone merge this")],
    ["a score above 1", (result: Record<string, unknown>) => (result.score = 1.01)],
    ["a negative score", (result: Record<string, unknown>) => (result.score = -0.01)],
    ["a score given as a string", (result: Record<string, unknown>) => (result.score = "0.1")],
    ["a null score (how JSON writes NaN)", (result: Record<string, unknown>) => (result.score = null)],
    ["an unknown tier", (result: Record<string, unknown>) => (result.tier = "blue")],
    ["a tier with different case", (result: Record<string, unknown>) => (result.tier = "Green")],
    ["an unknown model kind", (result: Record<string, unknown>) => (result.model = "custom")],
    ["a short head sha", (result: Record<string, unknown>) => (result.head = "abc1234")],
    ["an upper-case head sha", (result: Record<string, unknown>) => (result.head = "A".repeat(40))],
    ["a head sha with a trailing newline", (result: Record<string, unknown>) => (result.head = `${HEAD_SHA}\n`)],
    ["a version with markup", (result: Record<string, unknown>) => (result.opendrs = "0.5.2 <img src=x>")],
    ["a version that is too long", (result: Record<string, unknown>) => (result.opendrs = `1.2.3-${"a".repeat(40)}`)],
    ["signals that are not a list", (result: Record<string, unknown>) => (result.signals = { id: "size.churn" })],
    [
      "more signals than the comment shows",
      (result: Record<string, unknown>) =>
        (result.signals = Array.from({ length: FORK_RESULT_MAX_SIGNALS + 1 }, () => ({ id: "size.churn", value: 1, contribution: 1 }))),
    ],
    ["a signal id that is not a known signal", (result: Record<string, unknown>) => (result.signals = [{ id: "size.madeup", value: 1, contribution: 1 }])],
    ["a signal id with a mention", (result: Record<string, unknown>) => (result.signals = [{ id: "@org/team", value: 1, contribution: 1 }])],
    ["a signal id with markup", (result: Record<string, unknown>) => (result.signals = [{ id: "size.churn`<b>", value: 1, contribution: 1 }])],
    ["a signal with an unknown key", (result: Record<string, unknown>) => (result.signals = [{ id: "size.churn", value: 1, contribution: 1, summary: "x" }])],
    ["a signal value out of bounds", (result: Record<string, unknown>) => (result.signals = [{ id: "size.churn", value: 1e12, contribution: 1 }])],
    ["a signal contribution out of bounds", (result: Record<string, unknown>) => (result.signals = [{ id: "size.churn", value: 1, contribution: -1e6 }])],
    ["a signal value given as a string", (result: Record<string, unknown>) => (result.signals = [{ id: "size.churn", value: "1", contribution: 1 }])],
    ["a negative count", (result: Record<string, unknown>) => (result.counts = { files: -1, added: 0, deleted: 0, unknowns: 0 })],
    ["a fractional count", (result: Record<string, unknown>) => (result.counts = { files: 1.5, added: 0, deleted: 0, unknowns: 0 })],
    ["a count out of bounds", (result: Record<string, unknown>) => (result.counts = { files: 1, added: 1e15, deleted: 0, unknowns: 0 })],
    ["a missing count", (result: Record<string, unknown>) => (result.counts = { files: 1, added: 0, deleted: 0 })],
    ["an unknown count key", (result: Record<string, unknown>) => (result.counts = { files: 1, added: 0, deleted: 0, unknowns: 0, commits: 3 })],
  ])("rejects %s", (_, change) => {
    expect(parseWith(change)).toThrow(/not a valid opendrs fork result/);
  });

  it.each([
    ["an unknown reason", (result: Record<string, unknown>) => (result.reason = "because")],
    ["a negative limit", (result: Record<string, unknown>) => (result.limit = -1)],
    ["a limit out of bounds", (result: Record<string, unknown>) => (result.limit = 1e15)],
    ["a score on a too-large result", (result: Record<string, unknown>) => (result.score = 0.01)],
    ["a tier on a too-large result", (result: Record<string, unknown>) => (result.tier = "green")],
  ])("rejects a too-large result with %s", (_, change) => {
    expect(parseWith(change, validTooLarge)).toThrow(/not a valid opendrs fork result/);
  });

  it.each([
    ["top level", (key: string) => `{"${key}":{"v":1},${JSON.stringify(validScored()).slice(1)}`],
    ["inside signals[0]", (key: string) => JSON.stringify(validScored()).replace('"id":', `"${key}":{"polluted":true},"id":`)],
    ["inside counts", (key: string) => JSON.stringify(validScored()).replace('"files":', `"${key}":{"polluted":true},"files":`)],
  ])("rejects __proto__ and constructor keys at the %s", (_, inject) => {
    for (const key of ["__proto__", "constructor"]) {
      expect(() => parseForkResult(inject(key))).toThrow(/not a valid opendrs fork result: it has a key no result has/);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("checks lengths exactly: only a full commit hash as head, and a version of at most 32 characters", () => {
    expect(parseWith((result) => (result.head = "a".repeat(7)))).toThrow(/head/);
    expect(parseWith((result) => (result.head = "a".repeat(41)))).toThrow(/head/);
    expect(parseWith((result) => (result.opendrs = `1.2.3-${"a".repeat(16)}`))).not.toThrow();
    expect(parseWith((result) => (result.opendrs = `1.2.3-${"a".repeat(17)}`))).toThrow(/opendrs/);
    expect(parseWith((result) => (result.opendrs = `${"1".repeat(5)}.${"1".repeat(5)}.${"1".repeat(5)}-${"a".repeat(16)}`))).toThrow(/opendrs/);
  });

  it("never repeats the rejected text in its error, so hostile input cannot reach the log or a comment", () => {
    const hostile = "@everyone <script>alert(1)</script> ::error::pwned";
    for (const change of [
      (result: Record<string, unknown>) => (result[hostile] = 1),
      (result: Record<string, unknown>) => (result.tier = hostile),
      (result: Record<string, unknown>) => (result.signals = [{ id: hostile, value: 1, contribution: 1 }]),
    ]) {
      let message = "";
      try {
        parseWith(change)();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/not a valid opendrs fork result/);
      expect(message).not.toContain("everyone");
      expect(message).not.toContain("script");
      expect(message).not.toContain("pwned");
    }
  });
});

describe("buildForkResult", () => {
  const scoreResult = () => {
    const result = fakeResult(0.123456, "green", "auto-approve");
    result.diff.head = HEAD_SHA;
    result.unknowns = ["blast.dependents"];
    result.contributions = [
      { id: "size.churn", value: 4.123456, weight: 0.25, contribution: 1.030864 },
      { id: "tests.missing", value: 1, weight: 0.7, contribution: 0.7 },
      { id: "lang.docs", value: 0, weight: -0.4, contribution: 0 },
    ];
    return result;
  };

  it("keeps only what the comment needs: no decision, reasons, reviewers, summaries or file names", () => {
    const forkResult = buildForkResult(scoreResult());
    expect(forkResult).toStrictEqual({
      v: 1,
      status: "scored",
      head: HEAD_SHA,
      opendrs: "0.1.5",
      score: 0.1235,
      tier: "green",
      model: "default",
      signals: [
        { id: "size.churn", value: 4.1235, contribution: 1.0309 },
        { id: "tests.missing", value: 1, contribution: 0.7 },
      ],
      counts: { files: 1, added: 3, deleted: 1, unknowns: 1 },
    });
  });

  it("round-trips through serialize and parse", () => {
    const forkResult = buildForkResult(scoreResult());
    expect(parseForkResult(serializeForkResult(forkResult))).toStrictEqual(forkResult);
  });

  it("drops signals outside the known list and keeps at most the top few", () => {
    const result = scoreResult();
    result.contributions = [
      { id: "custom.signal", value: 1, weight: 1, contribution: 9 },
      ...[...KNOWN_SIGNAL_IDS].map((id, index) => ({ id, value: 1, weight: 1, contribution: index + 1 })),
    ];
    const forkResult = buildForkResult(result);
    expect(forkResult.signals).toHaveLength(FORK_RESULT_MAX_SIGNALS);
    expect(forkResult.signals.map((signal) => signal.id)).not.toContain("custom.signal");
    expect(() => parseForkResult(serializeForkResult(forkResult))).not.toThrow();
  });

  it("clamps numbers into the bounds the parser enforces, so a real result is never rejected", () => {
    const result = scoreResult();
    result.contributions = [{ id: "size.churn", value: 1e15, weight: 1, contribution: -1e15 }];
    result.diff.added = 1e15;
    const forkResult = buildForkResult(result);
    expect(() => parseForkResult(serializeForkResult(forkResult))).not.toThrow();
  });

  it("throws on a score that is not a finite number, instead of reporting it as 0 or 1", () => {
    for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = scoreResult();
      result.score = score;
      expect(() => buildForkResult(result)).toThrow(/not a finite number/);
    }
  });

  it("builds a too-large result that parses", () => {
    const tooLarge = buildTooLargeResult(HEAD_SHA, "bytes", 20_000_000, "0.5.2");
    expect(parseForkResult(serializeForkResult(tooLarge))).toStrictEqual(tooLarge);
    expect(tooLarge).not.toHaveProperty("score");
  });

  it("stays well under the size cap at its largest", () => {
    const result = scoreResult();
    result.diff.head = "f".repeat(64);
    result.contributions = [...KNOWN_SIGNAL_IDS].map((id) => ({ id, value: -123456.7891, weight: 1, contribution: -999.9999 }));
    expect(Buffer.byteLength(serializeForkResult(buildForkResult(result)))).toBeLessThan(FORK_RESULT_MAX_BYTES / 2);
  });
});
