---
type: regex
weight: 1
pattern: "Not ranked:[^\\n]*gateway\\.ts"
flags: "i"
match: contains
---

The brief's "Not ranked" line is a count ("1 other hunk in 1 file"), not a name; the one changed
file it refers to is `src/payments/gateway.ts`. `/opendrs-review` promises the coverage line names
the file(s) read for "Not ranked", so a review that read every changed hunk puts `gateway.ts` there.
A response that stopped at "Review first" cannot.
