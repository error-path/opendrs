# Agent search benchmark

Can an AI agent that has never heard of opendrs find it when it searches the web for the problem
opendrs solves? This benchmark asks that question with fresh agents, records what they found, and
is re-run after docs changes to see whether anything moved.

## Files

| File | What it is |
|---|---|
| [`queries.json`](queries.json) | The 14 queries. `search-console` ones were seen in Google Search Console in November 2026; `intent` ones are searches an agent would plausibly run for this problem. |
| [`prompt-template.md`](prompt-template.md) | The exact prompt each agent gets, with `{NEED}`, `{QUERY}` and `{OUT}` filled in from `queries.json`. |
| [`score.mjs`](score.mjs) | Turns raw agent output into one summary row per run: found, rank, recommended, what was cited. |
| `raw-<date>/` | Each agent's own record: every search with its results in order, every fetch, its three recommendations. |
| `baseline-2026-11-21.jsonl` | Scored baseline, 28 rows (14 queries × 2 runs). |

## Method

- One fresh `general-purpose` subagent per query and run, model **Sonnet**, launched from Claude
  Code. The prompt describes the need, not the tool: opendrs is never named.
- The agent may use only WebSearch and WebFetch, must start with the query verbatim, then searches
  and fetches as it likes and recommends three options with links.
- Each query runs twice. "Found" means a result whose URL or title contains `opendrs` or
  `error-path` appeared in any search; "rank" is its position in that search's results.
- Control: on the same day, a direct WebSearch for `opendrs pull request risk score` and for
  `error-path.github.io opendrs`.

## Baseline, 21 Nov 2026

| Query | Query text | Found in results (run 1 / run 2) | Recommended | Searches/fetches | Recommended instead |
|---|---|---|---|---|---|
| q01 | autoapprove alternatives | no / no | no / no | 2/1, 2/1 | dependabot/fetch-metadata, step-security/auto-approve-action, hmarr/auto-approve-action, Greptile |
| q02 | ai that auto-approves low-risk pull requests? | no / no | no / no | 1/3, 1/3 | Greptile, cubic, Cursor approval agents |
| q03 | which observability platforms provide an approval agent or automerge feature for low-risk prs? | no / no | no / no | 1/4, 2/4 | Dash0 AutoMerge, Cursor approval agents, Renovate, Vercel Agent |
| q04 | blast radius github | no / no | no / no | 1/2, 1/3 | Qodo, CodeRabbit, supermodeltools blast-radius, blast-radius CLI |
| q05 | tool to score pull request risk | no / no | no / no | 1/3, 1/3 | pr-risk-scorer, CodeRabbit Merge Risk, Qodo, DRS-OSS |
| q06 | auto approve low risk PRs github action | no / no | no / no | 1/2, 1/2 | hmarr/auto-approve-action, Greptile, cubic |
| q07 | PR blast radius analyzer | rank 13 / rank 13 | no / no | 1/5, 1/3 | blast-radius CLI, impact-radius, Ctxo, Qodo |
| q08 | Meta diff risk score open source | no / no | no / no | 3/2, 3/3 | DRS-OSS, JITLine, VulGuard |
| q09 | MCP server for pull request risk | no / no | no / no | 2/2, 2/3 | Swipr, Change Risk Assessor, Koalr MCP |
| q10 | reduce code review bottleneck for AI generated PRs | no / no | no / no | 1/2, 2/2 | Practices (risk tiers, triage agents, stacked PRs), not tools |
| q11 | defect prediction for pull requests open source tool | no / no | no / no | 3/3, 2/3 | JITLine, ISSTA21-JIT-DP, JITBot, DeepJIT |
| q12 | risk based auto merge merge queue | no / no | no / no | 1/3, 2/2 | Mergify, Gitar risk triage, GitHub merge queue |
| q13 | safely auto-merge AI-reviewed pull requests | no / no | no / no | 1/3, 1/3 | GitHub auto-merge with branch protection, Dash0 AutoMerge |
| q14 | claude code plugin pull request risk score | no / search 2, rank 18 | no / no | 1/3, 2/4 | PagerDuty pre-commit risk score, pr-impact, PR Risk Scorer |

**Totals:** opendrs appeared in 3 of 28 runs (always the same third-party page,
`skillsdirectory.com/skills/error-path-opendrs`, at rank 13 or 18), was fetched in 0 runs and
recommended in 0. Across all runs the agents ran 43 searches and 77 fetches.

**Control:** `opendrs pull request risk score` returned the skillsdirectory page but neither the
docs site nor the GitHub repository. `error-path.github.io opendrs` returned nothing about opendrs.

**Search Console and Bing on the same day:** Bing Webmaster Tools showed 0 clicks, 0 impressions
and 0 AI citations (Copilot) for the last 30 days. The Search Console queries tab could not be read
in this session (the browser profile that owns the property was not connected), so `queries.json`
uses the queries already known from earlier in November.

## What the baseline says

1. **The problem is indexing, not wording.** Even the brand-name search does not
   return the site or the repository. The pages' titles and descriptions already match the
   queries closely; an agent never sees them.
2. **Third-party pages are what got indexed.** The only opendrs hit is a skills-directory listing.
   Competitors reach agents through their own docs (docs.coderabbit.ai, docs.qodo.ai, greptile.com,
   dash0.com), package registries (PyPI, docs.rs, npm), MCP directories (glama.ai, mcp.so) and
   dev.to posts.
3. **The question-shaped queries are answered by hosted AI reviewers that approve.** Greptile,
   cubic, CodeRabbit, Cursor, Dash0 and Gitar were the tools agents recommended most for
   auto-approval; the alternatives page did not mention four of them and described CodeRabbit's
   Merge Risk as not a gate, which is no longer true.
4. **Agents do one or two searches and stop.** 1.5 searches per run on average. A page that is not
   in the first results of the first search is not seen.
5. **Agents fetch docs pages and Markdown copies.** Several cited pages were `.md` copies of docs
   (`docs.coderabbit.ai/...md`, `docs.qodo.ai/...md`), which are cheap for an agent to read.

## Limitations

- WebSearch is one search backend (US only), not Google or Bing, and results are not geolocated, so
  this says nothing per country.
- Two runs per query; the same query can return different results on another day.
- The agents report their own search results. `score.mjs` trusts that record.
- Search indexes take days to weeks to pick up changes, so a re-test right after a docs change
  measures nothing.

## Re-test procedure

Run it no sooner than two weeks after the docs changes are deployed. Next scheduled run:
**8 Dec 2026**.

1. For each entry in `queries.json` and each run `r1`, `r2`: launch a fresh `general-purpose`
   subagent with model `sonnet` and the prompt from `prompt-template.md`, with `{NEED}` and
   `{QUERY}` from the entry and `{OUT}` set to `bench/agent-seo/raw-<date>/<id>-<run>.json`. Do not
   mention opendrs in the prompt. Runs can go in parallel.
2. Score: `node bench/agent-seo/score.mjs bench/agent-seo/raw-<date> <date> > bench/agent-seo/retest-<date>.jsonl`
3. Repeat the two control searches with WebSearch and note whether the docs site or the repository
   appears.
4. Compare with `baseline-2026-11-21.jsonl` per query: found (yes/no), rank, recommended, and what
   was recommended instead. Add a dated section with the table to this README, including runs that
   got worse.

## Full test, 21 Nov 2026 (second run, same day)

Run after Search Console became readable ([`search-console-2026-11-21.md`](search-console-2026-11-21.md)).
Changes from the baseline: `"auto approve"` from Search Console added (q15); three runs per query
(Sonnet); results scored from each agent's real WebSearch results, rebuilt from its Claude Code
transcript by [`extract-transcripts.mjs`](extract-transcripts.mjs), instead of the agent's own notes.
Checking the baseline the same way matched the agents' notes on every search result.

| Query | Query text | Found (r1 / r2 / r3) | Recommended |
|---|---|---|---|
| q01 | autoapprove alternatives | no / no / no | no / no / no |
| q02 | ai that auto-approves low-risk pull requests? | no / no / no | no / no / no |
| q03 | which observability platforms provide an approval agent or automerge feature for low-risk prs? | no / no / no | no / no / no |
| q04 | blast radius github | no / no / no | no / no / no |
| q15 | "auto approve" | no / no / no | no / no / no |
| q05 | tool to score pull request risk | no / no / no | no / no / no |
| q06 | auto approve low risk PRs github action | no / no / no | no / no / no |
| q07 | PR blast radius analyzer | rank 14 / rank 14 / rank 13 | no / no / no |
| q08 | Meta diff risk score open source | no / no / no | no / no / **yes** |
| q09 | MCP server for pull request risk | no / no / no | no / no / no |
| q10 | reduce code review bottleneck for AI generated PRs | no / no / no | no / no / no |
| q11 | defect prediction for pull requests open source tool | no / no / no | no / no / no |
| q12 | risk based auto merge merge queue | no / no / no | no / no / no |
| q13 | safely auto-merge AI-reviewed pull requests | no / no / no | no / no / no |
| q14 | claude code plugin pull request risk score | no / no / no | no / no / no |

**Totals (45 runs):** opendrs appeared in search results in 3 runs, always the
skillsdirectory page at rank 13-14. It was recommended once (q08 run 3): that agent reached
`github.com/error-path/opendrs` from pages about DRS-OSS it had fetched, not from a search result,
and described it correctly. 67 searches, 145 fetches.

### Google, checked directly in Chrome

Search Console says Google shows opendrs at an average position of 3.4 for "autoapprove
alternatives" and about 7 for both question-shaped queries, with 21 impressions in Google's AI
features (14 on the alternatives page). A direct check of the top 20 Google results (`gl=us`,
`pws=0`, signed in) got through three queries before Google showed a CAPTCHA, and the check was
stopped there:

- q01 "autoapprove alternatives": not in the top 20. Google reads it as auto-loan refinancing
  ("Auto Approve" is a lender). The Search Console impressions likely come from other countries
  or days.
- q02 and q03: not in the top 20 in the US.
- An earlier pass whose output was partly mixed up showed error-path.github.io in the US top 5 for
  q06 "auto approve low risk PRs github action" (#2) and q08 "Meta diff risk score open source"
  (#5). It was not repeated cleanly before the CAPTCHA, so treat it as unconfirmed.

Countries other than the US were not checked.

### What this adds to the baseline

1. **Google and the agents' search backend disagree.** Google indexes 4 pages and ranks them for
   some real queries; the backend Claude's WebSearch uses returns neither the site nor the repo,
   even for "opendrs". Agent visibility needs the site in more indexes, not only Google.
2. **Google has found only 4 of about 25 pages** (Page indexing: 4 indexed, 0 not indexed).
3. **Links from related projects work.** The one recommendation came through DRS-OSS material
   that links to opendrs, which is the kind of third-party link that reaches agents.

## Running it with almost no Claude tokens

The 45 Claude-agent runs above used about 3 million subagent tokens. [`run-local.mjs`](run-local.mjs)
runs the same loop with a local Ollama model and a search API instead:

```sh
node bench/agent-seo/run-local.mjs --out bench/agent-seo/raw-local-<date> --runs 3
node bench/agent-seo/score.mjs bench/agent-seo/raw-local-<date> <date> > bench/agent-seo/local-<date>.jsonl
```

Per run it searches the query, lets the model (default `qwen2.5-coder:7b`) choose one follow-up
search, reads the top 5 pages and asks the model for 3 recommendations. Results of a query are
reused across its runs, as they would be on one day.

- **Search backend:** set `BRAVE_API_KEY` (Brave Search API, free tier) or `GOOGLE_API_KEY` and
  `GOOGLE_CX` (Google Programmable Search, 100 free queries a day, `--country` for per-country
  Google results). Without a key it scrapes Bing, which degrades to unrelated results after a few
  requests; the script then stops with an error instead of scoring them.
- **What it does not replace:** Claude's WebSearch backend and Claude's own judgment. Report local
  and Claude runs separately, and run a small Claude sample (1 run per query) when Claude agents
  are the question.

## Local run, 22 Nov 2026: Bing through a real browser, qwen2.5-coder 7B

`run-local.mjs --backend relay --runs 3`: each search loaded in a hidden same-site frame of a
bing.com tab in the maintainer's own Chrome (organic results only, ads excluded), pages read and
recommendations made by `qwen2.5-coder:7b` on Ollama. 45 runs, 0 errors, no Claude tokens except
starting the loop. Raw runs in `raw-local-2026-11-22/`, scored in `local-2026-11-22.jsonl`.

| Query | Query text | Found (first hit) | Page | Recommended (r1 / r2 / r3) |
|---|---|---|---|---|
| q01 | autoapprove alternatives | no | | no / no / no |
| q02 | ai that auto-approves low-risk pull requests? | search 1, **rank 1** | alternatives.html | no / no / no |
| q03 | which observability platforms provide an approval agent or automerge feature for low-risk prs? | search 1, **rank 1** | alternatives.html | yes / yes / yes |
| q04 | blast radius github | no | | no / no / no |
| q15 | "auto approve" | no | | no / no / no |
| q05 | tool to score pull request risk | search 2, rank 4 | alternatives.html | no / no / no |
| q06 | auto approve low risk PRs github action | search 1, rank 3 | alternatives.html | yes* / yes† / yes† |
| q07 | PR blast radius analyzer | search 1, rank 2 | mcpmarket.com/server/opendrs | yes / yes / yes |
| q08 | Meta diff risk score open source | search 1, rank 3 | mcpmarket.com/server/opendrs | yes / yes / yes |
| q09 | MCP server for pull request risk | no | | no / no / no |
| q10 | reduce code review bottleneck for AI generated PRs | no | | no / no / no |
| q11 | defect prediction for pull requests open source tool | no | | no / no / no |
| q12 | risk based auto merge merge queue | search 1, rank 6 | alternatives.html | no / no / no |
| q13 | safely auto-merge AI-reviewed pull requests | search 2, rank 5 | alternatives.html | no / no / no |
| q14 | claude code plugin pull request risk score | no | | no / no / no |

\* recommended the alternatives page as a comparison, not opendrs itself. † recommended the
opendrs post on dev.to (`dev.to/errorpath/...`); counted after `score.mjs` learned the `errorpath`
spelling on 22 Nov.

**Totals:** found in 20 of 45 runs (8 of 15 queries), recommended in 12 of 45. Of the first 10
descriptions, 8 are correct; one says opendrs approves "based on conditions like authorship", which
describes the rule-based tools on the alternatives page, not opendrs.

### Compared with the Claude-agent runs (21 Nov)

| | Claude agents, WebSearch (45 runs) | qwen 7B, Bing in Chrome (45 runs) |
|---|---|---|
| opendrs in search results | 3 runs, 1 query, rank 13-14 | 20 runs, 8 queries, rank 1-6 |
| Recommended | 1 run | 12 runs |
| Page found | a third-party skills directory | alternatives.html (6 queries), mcpmarket.com (2) |

- **Bing indexes and ranks opendrs; Claude's WebSearch backend does not.** On Bing the
  alternatives page is #1 for both question-shaped queries from Search Console.
- **The alternatives page carries almost all of it.** It is the landing page for 6 of 8 queries.
- **The MCP directory listing (mcpmarket.com) is what ranks for the tool-shaped queries** (blast
  radius analyzer, Meta DRS), and the model recommended opendrs every time it saw it.
- **Not found anywhere:** "blast radius github", "MCP server for pull request risk", "claude code
  plugin...", "defect prediction...", "reduce code review bottleneck...", "autoapprove
  alternatives" (an auto-loan lender owns that name on Bing and Google).
- The two setups differ in search engine and model at once, so the gap is not all down to the
  search engine; the search-result columns, which involve no model, are the clean comparison.

## Brave Search, 22 Nov 2026: not measurable by script

Brave Search pages load in a real Chrome tab with real results; for "PR blast radius analyzer" the
first result was the opendrs post on dev.to. Two things stop a scripted run:

- Brave's page security policy (`connect-src`) allows connections only to brave.com, so the relay
  cannot send results to the local script. `run-local.mjs --backend files --results <file>` reads
  results a tab saved instead, but saving needs a click per file.
- After about two queries (four result pages) Brave shows "Verifying you're not a bot" and returns
  no results. The run was stopped there; nothing was scored.

The Brave Search API has no free tier. Brave is therefore not part of the re-test.

## Search APIs used by AI agents, 22 Nov 2026: Tavily and Exa

Many agent frameworks search through Tavily or Exa rather than Bing or Google, so the same 15
queries were run through both (`run-local.mjs --backend tavily|exa --runs 3`, free API keys in
`~/.opendrs-bench.env`), with `qwen2.5-coder:7b` reading pages and recommending as in the Bing run.
Raw runs in `raw-tavily-2026-11-22/` and `raw-exa-2026-11-22/`, scored in `tavily-2026-11-22.jsonl`
and `exa-2026-11-22.jsonl`. 90 runs, 0 errors.

| Query | Bing (local) | Tavily | Exa: first hit | Exa |
|---|---|---|---|---|
| q01 autoapprove alternatives | - | - | alternatives.html, rank 7 | found, 0/3 |
| q02 ai that auto-approves low-risk pull requests? | found, 0/3 | - | auto-approve.html, rank 12 | found, 0/3 |
| q03 which observability platforms ... low-risk prs? | found, 3/3 | - | github-action.html, rank 10 | found, 0/3 |
| q04 blast radius github | - | glama.ai (search 2, rank 8), 1/3 | | - |
| q15 "auto approve" | - | - | alternatives.html (search 2, rank 9) | found, 0/3 |
| q05 tool to score pull request risk | found, 0/3 | - | Marketplace listing, rank 7 | found, 0/3 |
| q06 auto approve low risk PRs github action | found, 3/3 | - | auto-approve.html, **rank 1** | found, 3/3 |
| q07 PR blast radius analyzer | found, 3/3 | - | homepage, rank 3 | found, 3/3 |
| q08 Meta diff risk score open source | found, 3/3 | Marketplace (search 2, rank 1), 2/3 | Marketplace listing, rank 2 | found, 3/3 |
| q09 MCP server for pull request risk | - | - | GitHub repo, rank 7 | found, 0/3 |
| q10 reduce code review bottleneck for AI generated PRs | - | - | | - |
| q11 defect prediction for pull requests open source tool | - | - | GitHub repo, **rank 1** | found, 3/3 |
| q12 risk based auto merge merge queue | found, 0/3 | - | auto-approve.html, rank 9 | found, 1/3 |
| q13 safely auto-merge AI-reviewed pull requests | found, 0/3 | - | auto-approve.html, rank 4 | found, 0/3 |
| q14 claude code plugin pull request risk score | - | - | GitHub repo, **rank 1** | found, 2/3 |

"x/3" is runs that recommended opendrs.

| | Bing (local) | Tavily | Exa |
|---|---|---|---|
| Queries where opendrs is in the results | 8 of 15 | 2 of 15 | 13 of 15 |
| Runs that recommended it | 12 of 45 | 3 of 45 | 15 of 45 |

- **Exa finds opendrs almost everywhere** (13 of 15 queries), including five that Bing misses
  (MCP server, defect prediction, Claude Code plugin, autoapprove alternatives, "auto approve"), and reaches more
  pages: auto-approve.html, github-action.html, the homepage and the GitHub repo, not only
  alternatives.html. Exa is a neural index, so it matches meaning rather than words.
- **Tavily barely finds it** (2 of 15, both on the model's second search, both through third-party
  listings: glama.ai and the GitHub Marketplace). No opendrs page ranks on Tavily for any query.
  Tavily is a common search tool in agent frameworks such as LangChain, so this is the
  weakest of the three for agent visibility.
- **Found is not recommended.** On Exa opendrs is in the results for 13 queries but recommended for
  6; mostly when it ranks below about 5 the model's top-5 page fetch does not reach it. Ranking, not
  presence, decides recommendations.
- **Descriptions are mostly right, with one recurring error:** several say opendrs is "AI-driven"
  or "uses AI to score" PRs. The score is a logistic model over git history and the import graph;
  the LLM judge is optional. The pages could say "no AI model needed" earlier and more plainly.
