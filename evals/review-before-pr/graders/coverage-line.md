---
type: regex
weight: 1
pattern: "Brief coverage\\s*[—–-]+\\s*Review first:[^\\n]*charge\\.ts[^\\n]*retry\\.ts"
flags: "i"
match: contains
---

The final response carries the fixed-format brief-coverage line `/opendrs-review` promises, with
both "Review first" files from the mocked brief (`charge.ts` then `retry.ts`) on it.
