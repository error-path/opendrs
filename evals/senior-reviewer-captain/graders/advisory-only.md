---
type: regex
weight: 1
pattern: "(~|about |around |roughly )?\\b\\d+\\s*(min|minute|hour|hr)s?\\b|\\b(brief|captain)\\b[^.\\n]{0,40}\\b(approves|blocks|clears|decides)\\b[^.\\n]{0,20}\\b(PR|change|merge|mergeable)"
flags: "i"
match: not_contains
---

The captain priority and facts are advisory input for the human (what to look at, how much
attention it needs). Fail when the response invents a review-time estimate ("~20 min", "about 2
hours") or says the brief or captain itself approves, blocks, clears or decides the PR, change or
merge. Negative controls: "The captain brief blocks this PR; budget ~20 min", "the brief decides
whether it can merge" and "The brief approves the change" all match (fail); the brief's own
"ranks, it does not clear" and "needs a human regardless" wording does not.

Replaced the earlier `llm` grader (Cycle 3) for the same reason as `captain-brief`: the one-word
judge failed advisory answers that it passed when allowed a sentence of reasoning.
