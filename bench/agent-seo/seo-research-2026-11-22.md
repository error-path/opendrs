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

## Round 2 (four Opus research passes, same day)

**Sitemap "Couldn't fetch" (verified by curl):** the sitemap is valid (200, `application/xml`, 26
URLs); the github.io root `robots.txt` is a 404, which Google treats as "no restrictions". Google
said on 6 Oct 2026 that "Couldn't fetch" also shows for valid sitemaps when crawl demand is low
([SEJ](https://www.searchenginejournal.com/google-explains-couldnt-fetch-sitemap-errors/592040)).
Do not keep resubmitting; use URL Inspection "Test live URL" on the sitemap and "Request indexing"
on 5-10 key pages; if still failing after 2-3 weeks, submit a renamed copy.

**Custom domain (e.g. opendrs.dev): yes, do it early.** GitHub Pages does send 301s from the
github.io path to a custom domain (verified), so signals carry over. Gains: own `robots.txt`, a
Domain property in Search Console, off a free-subdomain host
([SEJ](https://www.searchenginejournal.com/googles-mueller-free-subdomain-hosting-makes-seo-harder/565249/)).
No measured indexing speed-up. Costs a domain purchase.

**How AI assistants pick tools:** "best X" list articles were 43.8% of ChatGPT's cited pages for
software questions, 35% of them on low-authority sites
([Ahrefs, Dec 2025](https://ahrefs.com/blog/best-lists-research/)): ask authors of current "best AI
code review / PR risk" lists to consider opendrs. Inbound links predicted Perplexity visibility,
"AI-optimized" content did not ([arXiv 2601.00912](https://arxiv.org/abs/2601.00912)). Answers
rarely repeat (SparkToro: <1% identical lists), so measure share of mentions over many runs.

**Launch tactics with numbers:** Show HN framed as "open-source alternative to <known tool>",
posted 12-17 UTC, answering comments from the first minute (138-launch study,
[arXiv 2511.04453](https://arxiv.org/html/2511.04453v1)); one concrete post per niche subreddit;
one niche-blogger write-up; honest one-page-per-competitor comparisons.

**Inside GitHub / Marketplace / npm / MCP registry:** opendrs ranks 23rd on GitHub search for
"blast radius pull request" (name matches win); Marketplace listing title is `name:` in
`action.yml` ("opendrs Diff Risk Score") and categories are the only documented discovery path;
MCP registry search is a substring match on the name; npm search is a text match on name,
description, keywords and README ([Socket, Dec 2024](https://socket.dev/blog/npm-updates-search-experience)).

**Against the rules / backfires:** bought or ring stars, HN upvote rings, seeded Reddit accounts,
hidden text aimed at models, writing your own Wikipedia article, keyword-stuffed topics/keywords,
duplicate packages or Actions.

## Maintainer decisions (not changed in the repo)

- **`action.yml` name:** rename "opendrs Diff Risk Score" to "opendrs PR Risk Score and Blast
  Radius", since the Marketplace listing title is `name:`. Risk: the listing slug
  (`opendrs-diff-risk-score`) may change, which would break links to the current listing.
- **Marketplace categories:** Code review and Continuous integration.
- **GitHub repo About text:** start with "PR blast radius analyzer and risk score ...".
- **Custom domain:** buy one (for example opendrs.dev) and point GitHub Pages at it (see Round 2).

## Round 3: how agent search APIs build their index (same day)

Prompted by the benchmark: Tavily found opendrs for 2 of 15 queries, Exa for 13 (see README).

- **Tavily** crawls with no distinct user agent, cannot reach what Googlebot cannot, and has no
  submit path ([Tavily docs](https://docs.tavily.com/documentation/search-crawler)). Whether it
  also fans out to other engines is reported by one analyst, not confirmed. Nothing is
  Tavily-specific to configure: Google indexing is the lever.
- **Perplexity** (`PerplexityBot`) and **You.com** (`YouBot`) run their own crawlers and respect
  robots.txt ([Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md),
  [You.com](https://you.com/docs/youbot)). The github.io root `robots.txt` is a 404, so nothing is
  blocked. You.com takes index requests at the address on its YouBot page.
- **Linkup** crawls a seed set of hostnames and promotes new hosts by PageRank over its link graph
  ([Linkup](https://www.linkup.so/blog/how-we-crawl-the-web-for-ai-search)): inbound links from
  established hosts are the way in, and a custom domain would be its own host.
- No study shows a tactic that improves ranking on these APIs specifically.

Adds to the maintainer list: one email to You.com asking YouBot to index the docs (a message sent
on the maintainer's behalf, so not sent by the agent).

## Round 4: six-angle audit (same day, after PRs #95-#97)

Six parallel passes: a technical crawl of the live site, off-site directories, search demand,
platform pages (GitHub, npm, Marketplace, MCP registry), where competitors get cited, and what an
agent reads in each page's first screenful (checked with the local 7B model).

**Technical crawl: the site is clean.** All 27 sitemap pages return 200 with no redirects; sitemap
URLs match canonicals exactly; unique titles and descriptions; valid JSON-LD; no noindex; a real
404. Nothing on the site explains Search Console's "Couldn't fetch". One broken internal link
(experiments.md to bench/verify) is fixed.
Known, accepted gap: the github.io root `robots.txt` is a 404, so its `Sitemap:` line is not read;
the sitemap is submitted directly in Search Console and Bing, and IndexNow runs on every deploy.

**First screenful.** The local model merged opendrs with the LLM-based tools on the alternatives
page and read the bottleneck page as "opendrs automates review". The first mention of opendrs on
seven pages now says what it is and that it needs no LLM.

**Search demand.** Autocomplete phrasings are about the mechanism ("auto approve pull request
github", "dependabot auto approve", "github auto merge not working"), not "risk score". Gaps:
why a bot approval does not count as a required review, auditing auto-approved PRs, and
Dependabot/Renovate behind a risk gate. Circuit Breaker (MSR 2026, review-effort triage for agent
PRs) is now in the alternatives table.

**Platforms.** The Marketplace title, npm keywords and MCP registry text only refresh at a release,
so one release (0.7.0) fixes all three. The Action description now leads with "PR risk score and
blast radius". GitHub repo search is star-driven: opendrs is not in the top 30 for "blast radius"
or "pr risk score". npm: #1 for "diff risk score", #2 for "pr risk score".

**Directories.** Listed: official MCP registry, punkpeye and TensorBlock awesome-mcp-servers,
glama.ai, mcpmarket.com, mcp.so, skillsdirectory.com (text cut off). Not listed: Anthropic plugin
directory, Cline marketplace, mcpservers.org, AlternativeTo, Smithery (needs an .mcpb bundle),
PulseMCP (submissions paused; ingests the official registry).

**Where competitors get cited.** Mostly their own "best tools" lists and launches (cubic: YC
page, Launch HN). The most honest channel for opendrs is research: a DRS-OSS preprint ranks on
three engines; arxiv.org is the third-largest host in our raw results. Venues: an arXiv cs.SE
tool report, the FSE 2027 tool-demo track (due 26 Jan 2027), Changelog News, Console.dev (takes
pre-1.0 tools; already contacted on 12 Nov), one Show HN.

### Recommendations from round 4 (maintainer decisions; none done by the agent)

| Recommendation | Effort | Expected effect |
|---|---|---|
| Cut release 0.7.0 | 1 hour (release runbook) | Marketplace title and description, npm keywords and MCP registry text go live at once |
| GitHub repo topics: swap `ci-cd`, `devops`, `developer-tools` for `mcp-server`, `risk-assessment`, `pr-risk-score`; retitle the floating `v0` release | 10 min | Topic pages and release titles carry the searched terms |
| Submit to the Anthropic plugin directory, Cline marketplace, mcpservers.org (free), AlternativeTo; awesome-claude-code once it reopens | 15-30 min each | Listings where agents and developers look; no measured effect yet |
| Changelog News note (draft in outreach-drafts.md), then one Show HN | 15 min; 1 day answering comments | Third-party pages that agents cite; HN threads rank |
| Short arXiv cs.SE tool report on the Diff Risk Score reproduction, reused for the FSE 2027 tool-demo track (due 26 Jan 2027) | 2-4 days | Research pages rank on several engines (DRS-OSS precedent) |
