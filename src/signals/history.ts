import type { ChangedFile, CommitInfo, Evidence, HistoryIndex, Incident, ScoringContext, Signal, SignalProvider } from "../domain/types.js";
import { INCIDENTS_FILE, loadIncidents, parseIncidents } from "../model/label.js";
import { asOfOrNow, countedFiles, historyAvailable, historyPath, plural, shallowAware, topEvidence, unknown } from "./util.js";

/** Spec §4 "history.*" signals. */
export const historySignals: SignalProvider = async (ctx) => {
  if (!historyAvailable(ctx)) {
    const why = "no commit history before this change";
    return [unknown("history.prior_fixes", why), unknown("history.incident", why), unknown("history.churn", why)];
  }
  const files = countedFiles(ctx);
  const days = ctx.config.history.lookbackDays;
  const now = asOfOrNow(ctx);
  const from = now - days * 86_400;

  const recent = new Map<string, { commit: CommitInfo; file: string }>();
  const perFile: Array<{ file: string; n: number }> = [];
  for (const f of files) {
    let n = 0;
    // fileCommits is newest-first, so stop at the first commit older than the window.
    for (const c of ctx.history.fileCommits(historyPath(f), ctx.asOf)) {
      if (c.time < from) break;
      if (c.time >= now) continue;
      n++;
      if (!recent.has(c.sha)) recent.set(c.sha, { commit: c, file: f.path });
    }
    if (n > 0) perFile.push({ file: f.path, n });
  }
  const fixes = [...recent.values()].filter(({ commit }) => commit.isFix || commit.isRevert);
  const window = `in the last ${plural(days, "day")}`;

  const priorFixes: Signal = {
    id: "history.prior_fixes",
    value: Math.log1p(fixes.length),
    status: "derived",
    summary: `${plural(fixes.length, "fix or revert commit")} touched these files ${window}`,
    evidence: topEvidence(fixes.map(({ commit, file }) => ({ file, detail: `${commit.sha.slice(0, 7)} ${commit.subject.slice(0, 80)}` }))),
  };
  const churn: Signal = {
    id: "history.churn",
    value: Math.log1p(recent.size),
    status: "derived",
    summary: `${plural(recent.size, "commit")} touched these files ${window}`,
    evidence: topEvidence(perFile.sort((a, b) => b.n - a.n).map(({ file, n }) => ({ file, detail: `${plural(n, "commit")} ${window}` }))),
  };
  return [priorFixes, await incidentSignal(ctx, files), churn].map((s) => shallowAware(ctx, s));
};

/** A past incident: when it became known, and which files it implicates. */
interface IncidentEvent {
  time?: number;
  label: string;
  files: Set<string>;
  prefixes: string[];
}

/**
 * Computes `history.incident`: whether a recorded incident or a revert touched a changed file.
 *
 * @param ctx - The scoring context. Without `asOf` (scoring a change), incidents come from the base
 * commit; with `asOf` (a replay over history), from the working tree's full log.
 * @param files - The changed files that count.
 * @returns The signal; unknown when the incidents file cannot be read or parsed.
 */
async function incidentSignal(ctx: ScoringContext, files: ChangedFile[]): Promise<Signal> {
  const id = "history.incident";
  let recorded: Incident[];
  try {
    // Like the brief: a PR must not write its own incidents. A replay is point-in-time through
    // asOf instead, and needs incidents recorded after the replayed commit.
    recorded = ctx.asOf === undefined ? parseIncidents((await ctx.readBase(INCIDENTS_FILE)) ?? "") : await loadIncidents(ctx.repoDir);
  } catch (error) {
    return unknown(id, `could not read ${INCIDENTS_FILE}: ${(error as Error).message}`);
  }
  const { lookup, reverts } = indexFor(ctx.history);
  const events = [...reverts];
  for (const inc of recorded) {
    const inducing = inc.inducing ? lookup(inc.inducing) : undefined;
    const fix = inc.fix ? lookup(inc.fix) : undefined;
    const sha = inc.inducing ?? inc.fix;
    events.push(
      makeEvent(
        // Known once fixed; an incident without a resolvable commit has no time and always counts.
        fix?.time ?? inducing?.time,
        inc.note ?? `incident ${sha ? sha.slice(0, 7) : "(paths)"}`,
        [...(inducing?.files ?? []), ...(fix?.files ?? [])],
        inc.paths ?? [],
      ),
    );
  }

  const visible = events.filter((e) => e.time === undefined || ctx.asOf === undefined || e.time < ctx.asOf);
  const evidence: Evidence[] = [];
  for (const f of files) {
    const paths = f.oldPath ? [f.path, f.oldPath] : [f.path];
    for (const e of visible) {
      const detail = paths.map((p) => matchEvent(e, p)).find((d) => d !== undefined);
      if (detail) {
        evidence.push({ file: f.path, detail });
        break;
      }
    }
  }
  const hits = evidence.length;
  return {
    id,
    value: hits > 0 ? 1 : 0,
    status: "derived",
    summary: hits ? `a past incident or revert touched ${plural(hits, "changed file")}` : "no recorded incident or revert touched these files",
    evidence: topEvidence(evidence),
  };
}

function matchEvent(e: IncidentEvent, path: string): string | undefined {
  if (e.files.has(path)) return `${e.label} touched this file`;
  const prefix = e.prefixes.find((q) => path === q || path.startsWith(`${q}/`));
  return prefix === undefined ? undefined : `${e.label} implicated ${prefix}`;
}

function makeEvent(time: number | undefined, label: string, files: string[], prefixes: string[]): IncidentEvent {
  return {
    time,
    label,
    files: new Set(files),
    prefixes: prefixes.map((p) => p.replace(/\/+$/, "")).filter(Boolean),
  };
}

interface HistoryLookups {
  lookup(sha: string): CommitInfo | undefined;
  reverts: IncidentEvent[];
}

// Backtests score thousands of commits against one HistoryIndex; build these once per index.
const cache = new WeakMap<HistoryIndex, HistoryLookups>();

function indexFor(history: HistoryIndex): HistoryLookups {
  let hit = cache.get(history);
  if (hit) return hit;
  const bySha = new Map(history.commits.map((c) => [c.sha, c]));
  const lookup = (sha: string) => bySha.get(sha) ?? (sha.length >= 7 ? history.commits.find((c) => c.sha.startsWith(sha.toLowerCase())) : undefined);
  const reverts = history.commits.flatMap((c) => {
    if (!c.revertsSha) return [];
    const target = lookup(c.revertsSha);
    return [makeEvent(c.time, `revert of ${c.revertsSha.slice(0, 7)}`, target?.files ?? c.files, [])];
  });
  hit = { lookup, reverts };
  cache.set(history, hit);
  return hit;
}
