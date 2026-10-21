---
type: regex
weight: 1
pattern: "(?=[\\s\\S]*careful review)(?=[\\s\\S]*(critical path|paths\\.critical))(?=[\\s\\S]*src/http)(?=[\\s\\S]*(chargeCard|signature))(?=[\\s\\S]*(charge\\.test\\.ts|coupling|test file|test change|without (a )?(matching )?test|no tests?|missing test))"
flags: "i"
match: contains
---

This is exactly the captain scenario from docs/captain.md: a final human reviewer after two AI
review rounds. The mocked brief's "For the captain" section says `Priority: careful review` with
four deterministic facts: paths.critical on `src/payments/charge.ts`; `src/payments` importing
`src/http` for the first time; the exported `chargeCard` signature change with 9 importers; and
coupling.missing with `tests/payments/charge.test.ts`. Pass when the response names the priority
and each of the four facts (named or described in substance). A generic "check tests, check
naming" checklist that ignores opendrs's output cannot match.

Replaced the earlier `llm` grader (Cycle 3): judged on the final response alone by a one-word
verdict, it failed every answer once `/opendrs-review`'s full body started loading and the
answers grew past ~3 KB, while the same model given one sentence of reasoning passed them.
