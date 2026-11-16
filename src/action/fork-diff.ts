import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ChangedFile, FileStatus } from "../domain/types.js";
import { commitShaSchema, describeSchemaIssues } from "../domain/untrusted.js";
import { parseUnifiedDiff } from "../git/diff.js";
import { matchAny } from "../git/glob.js";
import { isCodeFamily, languageFamily } from "../signals/language.js";
import type { ForkScoreLimits } from "./fork-limits.js";

// Builds the diff of a fork pull request from GitHub's REST API, so the scoring job never fetches
// or checks out the fork's commits. Everything here is data a fork controls (file names, patches,
// file contents): it is parsed, measured and counted, and never run or written to disk.
//
// The rule throughout: a part of the change that cannot be read must never make the change look
// smaller. It is counted as binary, or it stops the scoring, or it leaves a signal unknown.

/** One entry of `GET /pulls/{number}/files`; only the fields the diff needs. */
const pullFileSchema = z.object({
  filename: z.string().min(1).max(4096),
  previous_filename: z.string().min(1).max(4096).optional(),
  status: z.string().max(32),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  sha: commitShaSchema.nullish(),
  // Absent for a binary file, a file too large for GitHub to diff, and a change with no text diff.
  patch: z.string().optional(),
});

/** A changed file as GitHub's API lists it. */
export type PullFile = z.infer<typeof pullFileSchema>;

/** How GitHub's file statuses map to opendrs's; `copied` is a new file, `changed` a modified one. */
const STATUS_BY_API_STATUS = new Map<string, FileStatus>([
  ["added", "added"],
  ["copied", "added"],
  ["removed", "deleted"],
  ["modified", "modified"],
  ["changed", "modified"],
  ["renamed", "renamed"],
]);

/** The header that lets the diff parser read a patch. The path is fixed, never the file's own name. */
const PARSER_HEADER = "diff --git a/file b/file\n--- a/file\n+++ b/file\n";

/**
 * Checks the listing of a pull request's changed files.
 *
 * @param listedFiles - The entries of `GET /pulls/{number}/files`, as received.
 * @returns The files, or a description of what is wrong with the listing (field names and codes only) when any entry is not what GitHub documents.
 */
export function parsePullFiles(listedFiles: readonly unknown[]): { files: PullFile[] } | { issues: string } {
  const parsed = z.array(pullFileSchema).safeParse(listedFiles);
  return parsed.success ? { files: parsed.data } : { issues: describeSchemaIssues(parsed.error.issues) };
}

/**
 * Adds up the size of every patch in a listing.
 *
 * @param pullFiles - The changed files.
 * @returns The total patch text, in UTF-8 bytes.
 */
export function countPatchBytes(pullFiles: readonly PullFile[]): number {
  return pullFiles.reduce((total, pullFile) => total + Buffer.byteLength(pullFile.patch ?? "", "utf8"), 0);
}

/**
 * Turns one API entry into a changed file.
 *
 * - A readable patch gives the file its hunks and line counts.
 * - No patch and no changed lines (a binary file, or a rename without changes), or a patch with a
 *   NUL: the file is binary with no line counts, as the git path marks one.
 * - No patch although GitHub counts changed lines (it omits the patch of a large diff), or a patch
 *   that does not parse as exactly one file's hunks: the file keeps GitHub's line counts, so its
 *   size still counts in full, and is marked `hasUnreadablePatch`, so the signals that read
 *   changed lines report unknown.
 *
 * @param pullFile - The entry from the files listing.
 * @param ignorePatterns - The base config's `paths.ignore` globs.
 * @returns The changed file, with its hunks when the patch is readable text.
 */
function toChangedFile(pullFile: PullFile, ignorePatterns: readonly string[]): ChangedFile {
  const status = STATUS_BY_API_STATUS.get(pullFile.status) ?? "modified";
  const changedFile: ChangedFile = {
    path: pullFile.filename,
    status,
    added: 0,
    deleted: 0,
    binary: true,
    hunks: [],
    ignored: matchAny(ignorePatterns, pullFile.filename),
  };
  if (status === "renamed" && pullFile.previous_filename !== undefined) changedFile.oldPath = pullFile.previous_filename;

  const markUnreadable = (): ChangedFile => ({ ...changedFile, binary: false, added: pullFile.additions, deleted: pullFile.deletions, hasUnreadablePatch: true });
  const patch = pullFile.patch;
  if (patch === undefined) return pullFile.additions + pullFile.deletions > 0 ? markUnreadable() : changedFile;
  // Only a NUL makes a patch binary. GitHub replaces bytes that are not UTF-8 with U+FFFD, which
  // real text holds too, so that character alone does not hide a file's lines.
  if (patch.includes("\u0000")) return changedFile;

  const parsedFiles = parseUnifiedDiff(`${PARSER_HEADER}${patch}\n`);
  const parsedFile = parsedFiles[0];
  if (parsedFiles.length !== 1 || parsedFile === undefined || parsedFile.hunks.length === 0 || parsedFile.binary) return markUnreadable();
  changedFile.binary = false;
  changedFile.hunks = parsedFile.hunks;
  changedFile.added = parsedFile.added;
  changedFile.deleted = parsedFile.deleted;
  if (parsedFile.submodule) changedFile.submodule = true;
  return changedFile;
}

/**
 * Builds the changed-file list of a pull request from GitHub's files listing.
 *
 * @param pullFiles - The validated listing.
 * @param ignorePatterns - The base config's `paths.ignore` globs.
 * @returns One changed file per entry, in the listing's order.
 */
export function buildChangedFiles(pullFiles: readonly PullFile[], ignorePatterns: readonly string[]): ChangedFile[] {
  return pullFiles.map((pullFile) => toChangedFile(pullFile, ignorePatterns));
}

/**
 * Tells whether downloaded bytes are the git blob they were asked for.
 *
 * Only a SHA-1 name (40 characters) is checked. A SHA-256 name (64 characters) is accepted without
 * a check: such a repository hashes blobs differently, and GitHub does not host one today.
 *
 * @param content - The downloaded bytes.
 * @param expectedSha - The blob hash from the files listing.
 * @returns True when the content hashes to `expectedSha`, or when the name is not SHA-1.
 */
export function isBlobContent(content: Buffer, expectedSha: string): boolean {
  if (expectedSha.length !== 40) return true;
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex") === expectedSha;
}

/** Reads a head file by path; undefined when opendrs does not have it. */
export type HeadReader = (path: string) => Promise<string | undefined>;

/**
 * Why the head contents are not available: a `cap` was reached, which is expected for a large pull
 * request, or a download had a `failure`, which is not. `detail` says which, for the log.
 */
export interface HeadContentsGap {
  kind: "cap" | "failure";
  detail: string;
}

/**
 * Reads the changed code files at the head commit through the API, within the caps.
 *
 * Only files the complexity signal reads are fetched: changed, not deleted, not ignored, text, and
 * in a code language. Each is fetched by its blob hash from the listing and checked against that
 * hash. A file that holds a NUL is marked binary on `changedFiles`; a file that is not valid UTF-8
 * keeps its line counts, and the reader then returns undefined for every file.
 *
 * If any wanted file cannot be had (more files than the cap, a file or the total over its byte
 * cap, a failed or mismatched download, a listing entry without a blob hash), the reader returns
 * undefined for every file. The signal then reports unknown, which counts as risk, instead of a
 * count that silently leaves files out.
 *
 * @param changedFiles - The changed files; a file found to be binary is updated in place.
 * @param pullFiles - The listing the changed files were built from, in the same order.
 * @param readBlob - Downloads a blob, or returns undefined when it is over the byte cap.
 * @param limits - The caps on files and bytes.
 * @returns A reader for head contents, and the reason when not every wanted file was read.
 */
export async function readHeadContents(
  changedFiles: ChangedFile[],
  pullFiles: readonly PullFile[],
  readBlob: (blobSha: string, maxBytes: number) => Promise<Buffer | undefined>,
  limits: ForkScoreLimits,
): Promise<{ readHead: HeadReader; gap?: HeadContentsGap }> {
  const unavailable = (kind: HeadContentsGap["kind"], detail: string) => ({ readHead: async () => undefined, gap: { kind, detail } });
  const wantedFiles = changedFiles.flatMap((changedFile, index) => {
    const isWanted = changedFile.status !== "deleted" && !changedFile.binary && !changedFile.ignored && isCodeFamily(languageFamily(changedFile.path));
    return isWanted ? [{ changedFile, sha: pullFiles[index]?.sha ?? undefined }] : [];
  });
  if (wantedFiles.length > limits.maxHeadFiles) {
    return unavailable("cap", `${wantedFiles.length} changed code files, more than the ${limits.maxHeadFiles} that are read`);
  }

  const textByPath = new Map<string, string>();
  let totalBytes = 0;
  for (const { changedFile, sha } of wantedFiles) {
    // The details name blob hashes, never paths: a fork chooses its file names, and these go to the log.
    if (sha === undefined) return unavailable("failure", "GitHub listed a changed code file without a blob hash");
    let content: Buffer | undefined;
    try {
      content = await readBlob(sha, limits.maxHeadFileBytes);
    } catch (error) {
      return unavailable("failure", `downloading blob ${sha} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (content === undefined) return unavailable("cap", `a changed code file is larger than ${limits.maxHeadFileBytes} bytes`);
    if (!isBlobContent(content, sha)) return unavailable("failure", `the content GitHub returned for blob ${sha} does not match that hash`);
    totalBytes += content.length;
    if (totalBytes > limits.maxHeadTotalBytes) return unavailable("cap", `the changed code files are larger than ${limits.maxHeadTotalBytes} bytes in total`);
    if (content.includes(0)) {
      // GitHub showed a text patch, but the file holds a NUL: treat it as binary, as the git path does.
      changedFile.binary = true;
      changedFile.hunks = [];
      changedFile.added = 0;
      changedFile.deleted = 0;
      delete changedFile.hasUnreadablePatch;
      continue;
    }
    // Text with a byte that is not UTF-8 is still text to git: its lines keep counting, and only its
    // branch keywords cannot be counted reliably, so the head contents as a whole are left unread.
    if (!isUtf8(content)) return unavailable("failure", `the content of blob ${sha} at the head commit is not valid UTF-8`);
    textByPath.set(changedFile.path, content.toString("utf8"));
  }
  return { readHead: async (path) => textByPath.get(path) };
}
