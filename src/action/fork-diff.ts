import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ChangedFile, FileStatus } from "../domain/types.js";
import { parseUnifiedDiff } from "../git/diff.js";
import { matchAny } from "../git/glob.js";
import { isCodeFamily, languageFamily } from "../signals/language.js";
import type { ForkScoreLimits } from "./fork-limits.js";

// Builds the diff of a fork pull request from GitHub's REST API, so the scoring job never fetches
// or checks out the fork's commits. Everything here is data a fork controls (file names, patches,
// file contents): it is parsed, measured and counted, and never run or written to disk.

const blobSha = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

/** One entry of `GET /pulls/{number}/files`; only the fields the diff needs. */
const pullFileSchema = z.object({
  filename: z.string().min(1).max(4096),
  previous_filename: z.string().min(1).max(4096).optional(),
  status: z.string().max(32),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  sha: blobSha.nullish(),
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
 * @returns The files, or undefined when any entry is not what GitHub documents, which the caller treats as an incomplete listing.
 */
export function parsePullFiles(listedFiles: readonly unknown[]): PullFile[] | undefined {
  const parsed = z.array(pullFileSchema).safeParse(listedFiles);
  return parsed.success ? parsed.data : undefined;
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
 * A file without a patch, or with a patch that does not parse as exactly one file's hunks, or that
 * holds a NUL or a character GitHub had to replace, is marked binary with no line counts, as the
 * git path marks one: opendrs then counts it as unreadable, never as an empty, safe change.
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

  const patch = pullFile.patch;
  if (patch === undefined || /[\u0000�]/.test(patch)) return changedFile;
  const parsedFiles = parseUnifiedDiff(`${PARSER_HEADER}${patch}\n`);
  const parsedFile = parsedFiles[0];
  if (parsedFiles.length !== 1 || parsedFile === undefined || parsedFile.hunks.length === 0 || parsedFile.binary) return changedFile;
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

/** Tells whether `content` is the git blob named `expectedSha`. Only SHA-1 names are checked; a SHA-256 name is accepted. */
function isBlobContent(content: Buffer, expectedSha: string): boolean {
  if (expectedSha.length !== 40) return true;
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex") === expectedSha;
}

/** Reads a head file by path; undefined when opendrs does not have it. */
export type HeadReader = (path: string) => Promise<string | undefined>;

/**
 * Reads the changed code files at the head commit through the API, within the caps.
 *
 * Only files the complexity signal reads are fetched: changed, not deleted, not ignored, text, and
 * in a code language. Each is fetched by its blob hash from the listing and checked against that
 * hash. A file that turns out not to be text is marked binary on `changedFiles`.
 *
 * If any wanted file cannot be had (more files than the cap, a file or the total over its byte
 * cap, a failed or mismatched download), the reader returns undefined for every file. The signal
 * then reports unknown, which counts as risk, instead of a count that silently leaves files out.
 *
 * @param changedFiles - The changed files; a file found to be binary is updated in place.
 * @param pullFiles - The listing the changed files were built from, in the same order.
 * @param readBlob - Downloads a blob, or returns undefined when it is over the byte cap.
 * @param limits - The caps on files and bytes.
 * @returns A reader for head contents, and whether every wanted file was read.
 */
export async function readHeadContents(
  changedFiles: ChangedFile[],
  pullFiles: readonly PullFile[],
  readBlob: (blobSha: string, maxBytes: number) => Promise<Buffer | undefined>,
  limits: ForkScoreLimits,
): Promise<{ readHead: HeadReader; isComplete: boolean }> {
  const unavailable = { readHead: async () => undefined, isComplete: false };
  const wantedFiles = changedFiles.flatMap((changedFile, index) => {
    const isWanted = changedFile.status !== "deleted" && !changedFile.binary && !changedFile.ignored && isCodeFamily(languageFamily(changedFile.path));
    return isWanted ? [{ changedFile, sha: pullFiles[index]?.sha ?? undefined }] : [];
  });
  if (wantedFiles.length > limits.maxHeadFiles) return unavailable;

  const textByPath = new Map<string, string>();
  let totalBytes = 0;
  for (const { changedFile, sha } of wantedFiles) {
    if (sha === undefined) return unavailable;
    let content: Buffer | undefined;
    try {
      content = await readBlob(sha, limits.maxHeadFileBytes);
    } catch {
      return unavailable;
    }
    if (content === undefined || !isBlobContent(content, sha)) return unavailable;
    totalBytes += content.length;
    if (totalBytes > limits.maxHeadTotalBytes) return unavailable;
    if (content.includes(0) || !isUtf8(content)) {
      // GitHub showed a text patch, but the file is not text: treat it as binary, as the git path does.
      changedFile.binary = true;
      changedFile.hunks = [];
      changedFile.added = 0;
      changedFile.deleted = 0;
      continue;
    }
    textByPath.set(changedFile.path, content.toString("utf8"));
  }
  return { readHead: async (path) => textByPath.get(path), isComplete: true };
}
