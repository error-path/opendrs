import { describe, expect, it } from "vitest";
import { readState, rescoreNotice, rescoreLine, stateMarker, type OpendrsState } from "../../src/action/state.js";

const HEAD = "a".repeat(40);

const FIRST = "b".repeat(40);

function state(over: Partial<OpendrsState> = {}): OpendrsState {
  return { head: HEAD, first: FIRST, firstRun: 1, score: 0.7612, tier: "yellow", decision: "human-review", run: 2, ...over };
}

describe("stateMarker / readState", () => {
  it("round-trips a state through the marker text", () => {
    const s = state();
    expect(readState(`some text\n${stateMarker(s)}\nmore text`)).toEqual(s);
  });

  it("renders the documented shape", () => {
    expect(stateMarker(state())).toBe(
      `<!-- opendrs-state: v1 head=${HEAD} first=${FIRST} firstRun=1 score=0.7612 tier=yellow decision=human-review run=2 -->`,
    );
  });

  it("parses a 0.3.x marker with no first= (first and firstRun undefined)", () => {
    expect(readState(`<!-- opendrs-state: v1 head=${HEAD} score=0.50 tier=green decision=auto-approve run=1 -->`)).toEqual({
      head: HEAD,
      first: undefined,
      firstRun: undefined,
      score: 0.5,
      tier: "green",
      decision: "auto-approve",
      run: 1,
    });
  });

  it("parses a marker with first= but no firstRun= (written before that field existed)", () => {
    expect(readState(`<!-- opendrs-state: v1 head=${HEAD} first=${FIRST} score=0.50 tier=green decision=auto-approve run=3 -->`)).toEqual({
      head: HEAD,
      first: FIRST,
      firstRun: undefined,
      score: 0.5,
      tier: "green",
      decision: "auto-approve",
      run: 3,
    });
  });

  it("rejects the whole marker when first= is malformed", () => {
    expect(readState(`<!-- opendrs-state: v1 head=${HEAD} first=xyz score=0.50 tier=green decision=auto-approve run=1 -->`)).toBeUndefined();
  });

  it("rejects the whole marker when firstRun= is malformed", () => {
    expect(readState(`<!-- opendrs-state: v1 head=${HEAD} first=${FIRST} firstRun=0 score=0.50 tier=green decision=auto-approve run=1 -->`)).toBeUndefined();
  });

  it("rejects firstRun= present without first= (cannot appear on its own)", () => {
    expect(readState(`<!-- opendrs-state: v1 head=${HEAD} firstRun=1 score=0.50 tier=green decision=auto-approve run=1 -->`)).toBeUndefined();
  });

  it("returns undefined when there is no marker (first run)", () => {
    expect(readState(undefined)).toBeUndefined();
    expect(readState("")).toBeUndefined();
    expect(readState("<!-- opendrs -->\n## Risk report")).toBeUndefined();
  });

  it.each([
    ["a short sha", `<!-- opendrs-state: v1 head=${"a".repeat(39)} score=0.50 tier=green decision=auto-approve run=1 -->`],
    ["an uppercase sha", `<!-- opendrs-state: v1 head=${"A".repeat(40)} score=0.50 tier=green decision=auto-approve run=1 -->`],
    ["a score above 1", `<!-- opendrs-state: v1 head=${HEAD} score=1.5 tier=green decision=auto-approve run=1 -->`],
    ["a score of 1 with nonzero decimals", `<!-- opendrs-state: v1 head=${HEAD} score=1.5000 tier=green decision=auto-approve run=1 -->`],
    ["an unknown tier", `<!-- opendrs-state: v1 head=${HEAD} score=0.50 tier=purple decision=auto-approve run=1 -->`],
    ["an unknown decision", `<!-- opendrs-state: v1 head=${HEAD} score=0.50 tier=green decision=maybe run=1 -->`],
    ["a run of 0", `<!-- opendrs-state: v1 head=${HEAD} score=0.50 tier=green decision=auto-approve run=0 -->`],
    ["a negative run", `<!-- opendrs-state: v1 head=${HEAD} score=0.50 tier=green decision=auto-approve run=-1 -->`],
    ["an extra field", `<!-- opendrs-state: v1 head=${HEAD} score=0.50 tier=green decision=auto-approve run=1 extra=1 -->`],
    ["a missing version", `<!-- opendrs-state: head=${HEAD} score=0.50 tier=green decision=auto-approve run=1 -->`],
  ])("treats %s as no marker (first run)", (_, body) => {
    expect(readState(body)).toBeUndefined();
  });

  it("is conservative: takes neither marker when the comment has more than one", () => {
    const body = `${stateMarker(state({ run: 1 }))}\n${stateMarker(state({ run: 2 }))}`;
    expect(readState(body)).toBeUndefined();
  });

  it("ignores a state marker in a different comment or the PR body (callers pass only opendrs's own comment)", () => {
    // readState only ever sees the body callers hand it; a forged marker elsewhere never reaches it.
    // This test documents that the function itself has no notion of "which comment" - it trusts its input.
    expect(readState(stateMarker(state()))).toEqual(state());
  });
});

describe("rescoreLine", () => {
  it("names the head, the new run number, and the before/after score and tier", () => {
    const prev = state({ score: 0.76, tier: "yellow" });
    expect(rescoreLine(prev, 3, "abcdef1234567890123456789012345678901234", 0.28, "green")).toBe(
      "Re-scored for `abcdef1` (run 3) · was 0.76 yellow → now 0.28 green",
    );
  });
});

describe("rescoreNotice", () => {
  const linkToMainComment = "https://github.com/o/r/pull/7#issuecomment-2";

  it("names the short head, the new score, tier and decision, and links to the report", () => {
    expect(rescoreNotice("abcdef1234567890123456789012345678901234", 0.1834, "green", "auto-approve", { commentId: 2, linkToCommentOnGitHub: linkToMainComment })).toBe(
      "opendrs: re-scored at abcdef1 · 0.18 green · auto-approve · [see the updated report](https://github.com/o/r/pull/7#issuecomment-2)",
    );
  });

  it("falls back to a link within the page when the report's URL is missing or not a plain https URL", () => {
    const head = "a".repeat(40);
    for (const unsafeLinkToMainComment of [undefined, "", "javascript:alert(1)", "https://x/a)b", "https://x/a b"]) {
      expect(rescoreNotice(head, 0.5, "yellow", "human-review", { commentId: 2, linkToCommentOnGitHub: unsafeLinkToMainComment })).toBe(
        "opendrs: re-scored at aaaaaaa · 0.50 yellow · human-review · [see the updated report](#issuecomment-2)",
      );
    }
  });
});
