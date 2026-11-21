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
