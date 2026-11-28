import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_TREE } from "../../src/git/diff.js";
import { historySignals } from "../../src/signals/history.js";
import { makeRepo, type TestRepo } from "../helpers/repo.js";
import { byId, contextFor } from "./context.js";

const DAY = 86_400;
const T = 1_700_000_000;

function writeIncidents(repo: TestRepo, lines: string) {
  mkdirSync(join(repo.dir, ".opendrs"), { recursive: true });
  writeFileSync(join(repo.dir, ".opendrs/incidents.jsonl"), lines);
}

describe("historySignals", () => {
  let repo: TestRepo;
  afterEach(() => repo?.cleanup());

  it("counts fixes and churn on the changed files inside the lookback window", async () => {
    repo = makeRepo();
    repo.commit({ "src/a.ts": "0\n", "src/b.ts": "0\n" }, "init", undefined, T - 400 * DAY);
    repo.commit({ "src/a.ts": "1\n" }, "fix: ancient bug", undefined, T - 380 * DAY);
    repo.commit({ "src/a.ts": "2\n" }, "fix: recent bug", undefined, T - 10 * DAY);
    repo.commit({ "src/b.ts": "2\n" }, "feat: b", undefined, T - 9 * DAY);
    repo.commit({ "src/a.ts": "3\n", "src/b.ts": "3\n" }, "chore: both", undefined, T - 8 * DAY);
    repo.commit({ "src/c.ts": "3\n" }, "fix: unrelated", undefined, T - 7 * DAY);
    repo.commit({ "src/a.ts": "4\n", "src/b.ts": "4\n" }, "feat: scored change", undefined, T);
    const signals = await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T }));
    expect(signals.map((s) => s.id)).toEqual(["history.prior_fixes", "history.incident", "history.churn"]);
    expect(byId(signals, "history.prior_fixes")).toMatchObject({ value: Math.log1p(1), status: "derived" });
    expect(byId(signals, "history.churn")).toMatchObject({ value: Math.log1p(3), status: "derived" });
    expect(byId(signals, "history.incident")).toMatchObject({ value: 0, status: "derived" });
  });

  it("does not treat a reverted commit's sibling file in the same folder as an incident", async () => {
    repo = makeRepo();
    repo.commit({ "svc/a.ts": "a\n", "svc/b.ts": "b\n", "other/x.ts": "x\n" }, "init", undefined, T - 30 * DAY);
    const bad = repo.commit({ "svc/b.ts": "B\n" }, "feat: risky", undefined, T - 20 * DAY);
    repo.commit({ "svc/b.ts": "b\n" }, `Revert "feat: risky"\n\nThis reverts commit ${bad}.`, undefined, T - 10 * DAY);
    repo.commit({ "svc/a.ts": "A\n" }, "feat: touch sibling", undefined, T);
    const signals = await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T }));
    expect(byId(signals, "history.incident")).toMatchObject({ value: 0, status: "derived" });
  });

  it("treats a reverted commit that touched the same file as an incident", async () => {
    repo = makeRepo();
    repo.commit({ "svc/a.ts": "a\n", "svc/b.ts": "b\n", "other/x.ts": "x\n" }, "init", undefined, T - 30 * DAY);
    const bad = repo.commit({ "svc/b.ts": "B\n" }, "feat: risky", undefined, T - 20 * DAY);
    repo.commit({ "svc/b.ts": "b\n" }, `Revert "feat: risky"\n\nThis reverts commit ${bad}.`, undefined, T - 10 * DAY);
    repo.commit({ "svc/b.ts": "C\n" }, "feat: touch the same file again", undefined, T);
    const signals = await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T }));
    const incident = byId(signals, "history.incident");
    expect(incident).toMatchObject({ value: 1, status: "derived" });
    expect(incident.evidence[0]).toMatchObject({ file: "svc/b.ts" });
    expect(incident.evidence[0]!.detail).toContain(bad.slice(0, 7));
  });

  it("uses recorded incidents by commit and by path, point-in-time", async () => {
    repo = makeRepo();
    repo.commit({ "pay/core.ts": "0\n", "docs/x.md": "x\n" }, "init", undefined, T - 60 * DAY);
    const inducing = repo.commit({ "pay/core.ts": "1\n" }, "feat: inducing", undefined, T - 30 * DAY);
    repo.commit({ "pay/core.ts": "2\n" }, "feat: scored", undefined, T);
    writeIncidents(repo, JSON.stringify({ inducing: inducing.slice(0, 9), note: "outage" }) + "\n");
    expect(byId(await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T })), "history.incident").value).toBe(1);
    // Before the inducing commit existed, the incident is not visible.
    expect(byId(await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T - 31 * DAY })), "history.incident").value).toBe(0);

    writeIncidents(repo, JSON.stringify({ paths: ["pay/"] }) + "\n");
    expect(byId(await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T })), "history.incident").value).toBe(1);
    writeIncidents(repo, JSON.stringify({ paths: ["payments"] }) + "\n");
    expect(byId(await historySignals(await contextFor(repo, "HEAD~1", "HEAD", { asOf: T })), "history.incident").value).toBe(0);
  });

  it("reports history.incident as unknown when the base commit's incidents.jsonl is malformed", async () => {
    repo = makeRepo();
    repo.commit({ "a.ts": "1\n", ".opendrs/incidents.jsonl": "@attacker|x\n" }, "init");
    repo.commit({ "a.ts": "2\n" }, "change");
    const incident = byId(await historySignals(await contextFor(repo, "HEAD~1")), "history.incident");
    expect(incident).toMatchObject({ value: 0, status: "unknown" });
    // The raw parse error stays in the summary; the comment renderer escapes every summary (report/markdown).
    expect(incident.summary).toMatch(/incidents\.jsonl/);
  });

  it("scoring a change reads incidents from the base commit, so a PR cannot delete or add its own", async () => {
    repo = makeRepo();
    repo.commit({ "pay/core.ts": "0\n", ".opendrs/incidents.jsonl": JSON.stringify({ paths: ["pay/"] }) + "\n" }, "init", undefined, T - 60 * DAY);
    // The PR deletes the recorded incident and changes the implicated file.
    repo.commit({ "pay/core.ts": "1\n", ".opendrs/incidents.jsonl": null }, "feat: scored", undefined, T);
    expect(byId(await historySignals(await contextFor(repo, "HEAD~1")), "history.incident").value).toBe(1);

    // An incident only in the working tree (not on the base commit) does not count.
    repo.cleanup();
    repo = makeRepo();
    repo.commit({ "docs/x.md": "0\n" }, "init", undefined, T - 60 * DAY);
    repo.commit({ "docs/x.md": "1\n" }, "docs: scored", undefined, T);
    writeIncidents(repo, JSON.stringify({ paths: ["docs/"] }) + "\n");
    expect(byId(await historySignals(await contextFor(repo, "HEAD~1")), "history.incident")).toMatchObject({ value: 0, status: "derived" });
  });

  it("is unknown when there is no prior history (root commit)", async () => {
    repo = makeRepo();
    const first = repo.commit({ "a.ts": "1\n" }, "init");
    const signals = await historySignals(await contextFor(repo, EMPTY_TREE, first));
    expect(signals.map((s) => s.status)).toEqual(["unknown", "unknown", "unknown"]);
  });

  it("is unknown in a shallow clone, keeping what it saw as a lower bound", async () => {
    repo = makeRepo();
    repo.commit({ "src/a.ts": "0\n" }, "init", undefined, T - 30 * DAY);
    repo.commit({ "src/a.ts": "1\n" }, "fix: bug", undefined, T - 10 * DAY);
    repo.commit({ "src/a.ts": "2\n" }, "feat: scored change", undefined, T);
    const ctx = await contextFor(repo, "HEAD~1", "HEAD", { asOf: T });
    const signals = await historySignals({ ...ctx, trust: { authorVerified: true, historyComplete: false } });
    expect(signals.map((s) => s.status)).toEqual(["unknown", "unknown", "unknown"]);
    for (const s of signals) expect(s.summary, s.id).toContain("shallow clone: history incomplete");
    expect(byId(signals, "history.prior_fixes").value).toBe(Math.log1p(1));
    expect(byId(signals, "history.churn").value).toBe(Math.log1p(2));
  });
});
