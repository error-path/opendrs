---
title: "Research notes"
description: "Dated research notes behind opendrs: field tests on real repositories, how AI code reviewers judge pull request risk, and what published code-review practice means for the tool."
---

# Research notes

Dated notes from building opendrs: what was tested, on which repositories, and what changed as a
result. Each note lists its sources. The [experiment log](../experiments.md)
has the benchmark runs behind them.

{% assign notes = site.pages | where_exp: "p", "p.dir == '/research/'" | where_exp: "p", "p.date" | where_exp: "p", "p.sitemap != false" | sort: "date" | reverse %}
{% for note in notes %}
- [{{ note.title }}]({{ note.url | relative_url }}), {{ note.date | date: "%-d %b %Y" }}: {{ note.description }}
{% endfor %}
