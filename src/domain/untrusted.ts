import { z } from "zod";

// Helpers for reading data that someone outside the repository controls: a fork's pull request as
// GitHub's API reports it, and the result one workflow job hands to the next.

/** A full git commit or blob hash in lower case: 40 hex characters (SHA-1) or 64 (SHA-256). */
export const commitShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/);

/** A field name that is safe to print: short, and made of lower-case letters and underscores only. */
const PRINTABLE_FIELD = /^[a-z][a-z_]{0,31}$/;

/**
 * Describes why untrusted data failed a schema without repeating any of the data.
 *
 * Each issue is printed as the path of the field and zod's fixed issue code, for example
 * `signals.0.id: invalid_format`. A path part that is not a list index or a plain field name
 * prints as `?`, so a hostile key or value never reaches a log or a comment.
 *
 * @param issues - The issues of a failed `safeParse`.
 * @param maxIssues - How many issues to describe.
 * @returns The descriptions, joined with "; ".
 */
export function describeSchemaIssues(issues: readonly z.core.$ZodIssue[], maxIssues = 3): string {
  const descriptions = issues.slice(0, maxIssues).map((issue) => {
    const field = issue.path.map((part) => (typeof part === "number" ? String(part) : PRINTABLE_FIELD.test(String(part)) ? String(part) : "?")).join(".");
    return `${field || "value"}: ${issue.code}`;
  });
  return descriptions.join("; ");
}
