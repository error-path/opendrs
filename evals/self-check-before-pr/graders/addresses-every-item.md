---
type: regex
weight: 1
pattern: "(?=[\\s\\S]*\"id\":\\s*\"coupling\\.missing:src\\/payments\\/charge\\.ts\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")(?=[\\s\\S]*\"id\":\\s*\"hunk:src\\/payments\\/charge\\.ts:1\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")(?=[\\s\\S]*\"id\":\\s*\"hunk:src\\/payments\\/charge\\.ts:2\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")(?=[\\s\\S]*\"id\":\\s*\"hunk:src\\/payments\\/retry\\.ts:3\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")(?=[\\s\\S]*\"id\":\\s*\"check:src\\/payments\\/charge\\.ts:10:0\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")(?=[\\s\\S]*\"id\":\\s*\"check:src\\/payments\\/charge\\.ts:-:1\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")(?=[\\s\\S]*\"id\":\\s*\"check:src\\/payments\\/retry\\.ts:32:0\"[^}]*\"verdict\":\\s*\"(?:fixed|explained|needs-fix)\")"
match: contains
---

Every one of the seven ids the mocked `self_check_items` returns appears in the block with a verdict
that is one of the three the skill allows (`fixed`, `explained`, `needs-fix`). One lookahead per
id; an item left out of the block, or given any other verdict, fails. This is clause (a)+(b) of the
former `addresses-and-records` judge made deterministic.

