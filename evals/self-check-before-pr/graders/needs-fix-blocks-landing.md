---
type: regex
weight: 1
pattern: "^(?:(?![\\s\\S]*\"needs-fix\")[\\s\\S]*|[\\s\\S]*(?:(?:shouldn'?t|should not|mustn'?t|must not|don'?t|do not|not|never|can'?t|cannot|wouldn'?t)[^.\\n]{0,60}\\b(?:land|lands|landed|merge|merged|merging|ship|shipped|go up|go in|open(?:ing)? (?:the |this |a )?PR)\\b|\\bhold (?:off on )?(?:the |this )?PR\\b)[\\s\\S]*)$"
flags: "i"
match: contains
---

When any verdict in the block is `needs-fix`, the answer says plainly that the PR should not land,
merge, ship or be opened until it is resolved ("shouldn't land", "don't land", "wouldn't open the
PR until", "hold the PR"). An answer with no `needs-fix` verdict passes on the first alternative.
"Before you open the PR" alone does not count — it describes a sequence, not a hold.

