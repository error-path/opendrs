---
type: regex
weight: 1
pattern: "\"id\":\\s*\"check:src\\/payments\\/(?:charge\\.ts:10:0|retry\\.ts:32:0)\"[^}]*\"verdict\":\\s*\"explained\""
match: not_contains
---

The fixture's two real bugs — the retry wrapper always sets `retryIdempotencyKey` so the `409ffef`
in-flight guard never runs (`check:src/payments/charge.ts:10:0`), and `retry.ts` retries on any
thrown error (`check:src/payments/retry.ts:32:0`) — are live in the diff. `explained` means "does
not need fixing", which is false for both; fail when either check id carries it. `fixed` is not
forbidden here because Bash is granted and an agent can genuinely fix the code (one recorded run
did); whether a `fixed` claim is backed by an edit is not checkable from the final response.

