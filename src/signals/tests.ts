import type { OpendrsConfig } from "../domain/config.js";
import type { ChangedFile, SignalProvider } from "../domain/types.js";
import { matchAny } from "../git/glob.js";
import { isCodeFamily, languageFamily } from "./language.js";
import { countedFiles, plural, topEvidence, unknown } from "./util.js";

/** `paths.tests` glob match: shared with the layers detector (spec §6.2), which excludes test-file importers. */
export const isTestPath = (config: OpendrsConfig, path: string): boolean => matchAny(config.paths.tests, path);

/** Test lines a change needs, as a share of its source lines, before the penalty is gone. */
const EXPECTED_TEST_SHARE = 0.3;

/** Net deleted test lines (deleted − added) at which `tests.deleted` fires. */
const NET_TEST_DELETION = 10;

/**
 * Spec §4 "tests.missing": 1 when source changed and no test lines were added; otherwise
 * max(0, 1 − addedTestLines / (0.3 · sourceLines)), so a token test edit barely helps. Deleted test
 * lines never count as coverage.
 *
 * Spec §4 "tests.deleted": 1 when the PR deletes a whole test file (or renames one out of the test
 * globs), or deletes at least 10 more test lines than it adds.
 */
export const testsSignals: SignalProvider = async (ctx) => {
  const files = countedFiles(ctx);
  const unreadableFiles = files.filter((file) => file.hasUnreadablePatch && isCodeFamily(languageFamily(file.path)));
  if (unreadableFiles.length > 0) {
    const reason = `the changed lines of ${plural(unreadableFiles.length, "code file")} could not be read`;
    return [unknown("tests.missing", reason), unknown("tests.deleted", reason)];
  }
  const isTest = (path: string) => isTestPath(ctx.config, path);
  const lines = (fs: ChangedFile[]) => fs.reduce((n, f) => n + f.added + f.deleted, 0);
  const tests = files.filter((f) => isTest(f.path));
  const sources = files.filter((f) => !f.binary && !isTest(f.path) && isCodeFamily(languageFamily(f.path)));
  const testLines = tests.reduce((n, f) => n + f.added, 0);
  const sourceLines = lines(sources);

  let value: number;
  let summary: string;
  if (sources.length === 0) {
    value = 0;
    summary = "no source code changed";
  } else if (testLines === 0) {
    value = 1;
    summary = `${plural(sources.length, "source file")} changed with no test lines added`;
  } else {
    value = Math.min(1, Math.max(0, 1 - testLines / (EXPECTED_TEST_SHARE * sourceLines)));
    summary = `${plural(testLines, "test line")} added for ${plural(sourceLines, "source line")} changed (${EXPECTED_TEST_SHARE * 100}% expected)`;
  }

  const untested = sources.length > 0 && testLines === 0;

  const removedFiles = files.filter((f) => (f.status === "deleted" && isTest(f.path)) || (f.oldPath !== undefined && isTest(f.oldPath) && !isTest(f.path)));
  const netDeleted = tests.reduce((n, f) => n + f.deleted - f.added, 0);
  const deletes = removedFiles.length > 0 || netDeleted >= NET_TEST_DELETION;
  const deletedSummary = [
    removedFiles.length > 0 && `${plural(removedFiles.length, "test file")} deleted`,
    netDeleted >= NET_TEST_DELETION && `${plural(netDeleted, "test line")} more deleted than added`,
  ].filter(Boolean);

  return [
    {
      id: "tests.missing",
      value,
      status: "derived",
      summary,
      evidence: topEvidence(
        untested
          ? sources.map((f) => ({ file: f.path, detail: "source without added test lines" }))
          : tests.map((f) => ({ file: f.path, detail: `test file changed (+${f.added} -${f.deleted})` })),
      ),
    },
    {
      id: "tests.deleted",
      value: deletes ? 1 : 0,
      status: "observed",
      summary: deletes ? deletedSummary.join("; ") : "no test deletion",
      evidence: deletes
        ? topEvidence([
            ...removedFiles.map((f) => ({ file: f.path, detail: f.status === "deleted" ? "test file deleted" : `test file renamed from ${f.oldPath}` })),
            ...tests.filter((f) => f.status !== "deleted" && f.deleted > f.added).map((f) => ({ file: f.path, detail: `test lines removed (+${f.added} -${f.deleted})` })),
          ])
        : [],
    },
  ];
};
