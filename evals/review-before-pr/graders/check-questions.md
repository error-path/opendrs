---
type: regex
weight: 1
pattern: "(?=[\\s\\S]*retryIdempotencyKey)(?=[\\s\\S]*(\\bopts\\b|second (optional )?(param|argument)|= \\{\\}))(?=[\\s\\S]*(4xx|declin|non-retryable))"
match: contains
---

All three "Check specifically" questions from the mocked brief are addressed somewhere in the
final response: (Q1) `retryIdempotencyKey` always set, so the in-flight guard is skipped; (Q2) the
new optional second parameter (`opts`, default `= {}`) on `chargeCard` and its importers; (Q3)
whether `retry.ts` stops on a non-retryable error (4xx, card declined). Each lookahead is a term
a reviewer has to use to answer that question at all.
