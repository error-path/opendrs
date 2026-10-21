---
type: regex
weight: 1
pattern: "^(?:(?!\\n[ \\t]*[#*]*[ \\t]*(?:\\d+\\.\\s*)?P[0-3]\\b)[\\s\\S])*\\n[ \\t]*[#*]*[ \\t]*(?:\\d+\\.\\s*)?P[0-3]\\b(?:(?!gateway\\.ts)(?!\\n[ \\t]*[#*]*[ \\t]*(?:\\d+\\.\\s*)?P[0-3]\\b)[\\s\\S]){0,300}?(charge|retry)\\.ts"
match: contains
---

The first finding (the first line that starts with a P0–P3 label — as a `### P1` heading, a
`**P1**` bold lead or a numbered item, however `/opendrs-review`'s "priority label first" is
rendered) is located in a "Review first" file — `src/payments/charge.ts` or
`src/payments/retry.ts` in the mocked brief — named within 300 characters of the label, before
any mention of `gateway.ts` (the one changed file the brief left unranked) and before the next
P-label. Fails when the review leads with the unranked file or with no file at all, i.e. when it
did not address "Review first" first.

Replaced the earlier `llm` grader (Cycle 3): the judge sees only the final response, never the
brief, and the one-word haiku verdict passed a `gateway.ts`-first answer while failing
`charge.ts`-first ones. This regex checks the same promise deterministically.
