---
type: regex
weight: 1
pattern: "(?=[\\s\\S]*advisory)(?=[\\s\\S]*(?:not|n't|never|no effect|without)[^.\\n]{0,80}(?:score|tier|gate|approv|priority))"
flags: "i"
match: contains
---

The skill promises the record is restated as advisory in the agent's own words, next to the block:
the word "advisory" plus a sentence saying it does not change the score, tier, gate, approval or
captain priority (clause (c) of the former judge). Fail when either is missing.

