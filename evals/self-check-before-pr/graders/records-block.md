---
type: regex
weight: 1
pattern: "(?=[\\s\\S]*<!--\\s*opendrs-self-check:v1)(?=[\\s\\S]*(?:commit(?:'s)?(?: own)? message|message of (?:the|your) (?:head )?commit|in(?:to)? (?:your|the) (?:head |current )?commit\\b|amend))"
flags: "i"
match: contains
---

The final response carries the `<!-- opendrs-self-check:v1 ... -->` block and puts it in the head
commit's own message (the skill: "add this block to the end of your head commit's own message", or
propose it there when the commit can't be amended) — matched by "commit message", "message of the
commit", "in(to) your commit" or "amend". An answer that only describes the verdicts in prose, or
hands the record over with no placement, cannot match.

Replaced the `llm` grader `addresses-and-records` (Cycle 4): judged on the final response by a
one-word haiku verdict, it failed 1 in 4 answers that meet every written clause by hand-read (six
false negatives across the recorded runs, including 11-42 run 3 FAIL×3), the same structural
cause measured for `reading-order` and the captain graders in Cycle 3. Checked offline against
all 30 recorded answers: the only fails are the two stalls (no block) and the one answer with no
advisory disclaimer. Not covered by any regex: a prose count that disagrees with the block
("4 needs-fix" over a block with 5), and a `fixed` claim with no edit behind it.
