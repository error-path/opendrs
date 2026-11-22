# What works for search and AI-agent visibility, Nov 2026

Desk research on 22 Nov 2026 (three research passes over public sources, each asked to rank by
evidence and to name hype). Sources are linked; secondary summaries are marked. Use it with the
benchmark in this folder: change one thing, re-run, compare.

## Ranked actions for opendrs

| # | Action | Evidence | Who |
|---|---|---|---|
| 1 | **Get the other ~21 pages indexed by Google**: link every page from the homepage and 2-3 related pages; keep the sitemap with real `lastmod`; request indexing in Search Console only for key pages | AI Overviews and ChatGPT search draw mostly from pages that already rank ([Ahrefs, Mar 2026](https://ahrefs.com/blog/ai-overview-citations-top-10): 38% from the top 10; [Seer](https://www.seerinteractive.com/insights/87-percent-of-searchgpt-citations-match-bings-top-results): 87% of SearchGPT citations match Bing top results). Google: AI features need nothing beyond indexing ([Google](https://developers.google.com/search/docs/appearance/ai-features)) | Maintainer + docs change |
| 2 | **Off-site mentions where developers read**: dev.to, Show HN, Reddit, answers on Stack Overflow, awesome-lists, newsletters (disclose authorship) | Brand mentions correlate with AI visibility (r≈0.7, [Ahrefs, Dec 2025](https://ahrefs.com/blog/ai-brand-visibility-correlations), correlation only). Our own benchmark: the dev.to post was Brave's #1 and was recommended on Bing | Maintainer |
| 3 | **Index the repo in Context7 and DeepWiki** (context7.com/add-library; DeepWiki badge) | Agent-facing doc indexes with an open submit path ([Context7](https://context7.com/docs/adding-libraries), [DeepWiki](https://cognition.ai/blog/deepwiki)) | Maintainer (web forms) |
| 4 | **Statistics, quotations and cited sources in pages** | GEO paper: up to ~40% relative visibility gain, most for lower-ranked sites ([arXiv 2311.09735](https://arxiv.org/abs/2311.09735), tested on Perplexity-style engines) | Docs change |
| 5 | **Direct answer pages for long-tail questions** (one question, one page) | Pages cited outside the top 10 answer shorter, specific queries ([Ahrefs 2026](https://ahrefs.com/blog/ai-overview-citations-top-10)) | Docs change |
| 6 | **Submit the Claude Code plugin** (claude.ai/settings/plugins/submit); keep `marketplace.json` and `SKILL.md` so directories that scan GitHub list it | [Claude Code docs](https://code.claude.com/docs/en/discover-plugins) | Maintainer |
| 7 | **Watch Bing's AI Performance report** (citations, grounding queries, citation share) | Launched Feb 2026, expanded Jun 2026 ([Bing](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)) | Maintainer, monthly |
| 8 | **Static `.md` copies of docs pages** with `<link rel="alternate" type="text/markdown">` | Some agents request Markdown ([Vercel](https://vercel.com/kb/guide/how-to-serve-documentation-for-agents)); unverified for Claude Code | Docs change, low priority |

Already done: IndexNow on deploy (Bing's recommended route), MCP registry entry (Smithery and
PulseMCP ingest from it), `SoftwareApplication` JSON-LD, GitHub topics, npm keywords.

## Hype or no measured effect

- **llms.txt / llms-full.txt**: ~97% of files never requested ([Ahrefs](https://ahrefs.com/blog/llmstxt-study/));
  Google says it has no effect. Cheap to keep; expect nothing.
- **FAQ schema for AI citations**: no lift in a before/after study ([Ahrefs, May 2026](https://ahrefs.com/blog/schema-ai-citations/));
  Google stopped FAQ rich results on 7 May 2026. Harmless to keep.
- **AI-specific rewriting or "chunking"**: Google lists it as no advantage.
- **Star counts** as a recommendation signal; **listing on many MCP directories** as a strategy: no evidence.
- **Paid, guest-post or directory links; mass AI-generated pages**: against Google's spam policies.

## Independent review (same day, separate Opus pass)

- **Internal linking is not the indexing problem.** The live homepage already links all top-level
  pages (nav, "More" menu, footer); the sitemap is live with real `lastmod`. The likelier causes are
  the site's age (first commit 15 Oct 2026) on a `github.io` subpath, or a sitemap Google has not
  processed: "4 indexed, 0 not indexed" means the other URLs are not even "discovered". First step:
  check Search Console > Sitemaps for `/opendrs/sitemap.xml` ("Success", ~20 URLs), then URL
  Inspection on two unindexed pages.
- **Context7 / DeepWiki help adoption, not discovery**: an agent uses them once it knows the name.
- **Statistics: only real numbers from the repo's benchmarks**; one-question pages: a few, not many
  (Google's scaled-content spam policy).
- **Order:** (1) maintainer checks the sitemap in Search Console; (2) maintainer posts one or two
  disclosed write-ups (Show HN, dev.to follow-up) and awesome-list PRs; (3) docs: contextual links
  between related pages and a short real-numbers summary on the homepage and alternatives page;
  (4) Context7, DeepWiki badge, plugin submission; (5) change one thing at a time and re-run the
  benchmark before the next.
