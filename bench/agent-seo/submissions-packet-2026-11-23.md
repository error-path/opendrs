# opendrs submissions packet (prepared 2026-11-23)

What was submitted from this packet, and what was not, is in the Status table of
[outreach-drafts.md](outreach-drafts.md).

Everything below was checked against public pages on 2026-11-23. Re-read each form before sending.
Numbers come only from docs/results.md and docs/alternatives.md. Labels in those runs mean "later
needed a fix", not incidents; never write "accuracy".

Shared text (reused below):

- SHORT (100 chars): `Open-source PR risk score and blast radius: a 0-1 score from git history to auto-approve low-risk PRs.`
- LONG (no links, for forms that ban them):
  > opendrs gives each pull request a calibrated 0-1 risk score and blast radius, computed from your own git history and the import graph. It needs no LLM, API key or hosted service. A team sets a policy: for example, a low-risk PR that has passed an AI review is approved and sent to the merge queue, while riskier PRs wait for a person. It is not a code reviewer; it is meant to run after one. It is an independent open-source implementation of the idea behind Meta's Diff Risk Score, MIT licensed. It runs as a GitHub Action, a CLI, an MCP server (tools: score_diff, review_brief, self_check_items, explain_file_risk, list_hotspots, suggest_reviewers), a Claude Code plugin and an agent skill.
- Links: repo https://github.com/error-path/opendrs , site https://error-path.github.io/opendrs/ , results https://github.com/error-path/opendrs/blob/main/docs/results.md , comparison https://github.com/error-path/opendrs/blob/main/docs/alternatives.md
- Install: `npx -y @error-path/opendrs mcp` (MCP), `npx @error-path/opendrs score` (CLI), `uses: error-path/opendrs@v0` (Action).
- Tags: pull-request, risk-score, blast-radius, code-review, auto-approve, mcp-server, github-actions, claude-code
- Logo: `plugin/.claude-plugin/icon.png` in the repo is 1024x1024 RGBA. Cline needs a 400x400 PNG; AlternativeTo wants square, at least 280x280. Resize to 400x400 once and reuse.

---

## A. GitHub topics and the v0 release title

Account: none new; the maintainer's repo admin rights (repo page > About gear > Topics). Not done.

Current topics (read from api.github.com/repos/error-path/opendrs; 20 topics, GitHub's maximum):
ai-code-review, auto-approval, auto-approve, auto-approve-bot, auto-merge, blast-radius, ci-cd,
claude-code, code-quality, code-review, defect-prediction, developer-tools, devops, github-action,
github-actions, mcp, merge-queue, pull-request-risk, pull-requests, risk-score

Remove: ci-cd, devops, developer-tools. Add: mcp-server, risk-assessment, pr-risk-score.

Exact final list (20, paste into the Topics box):

    ai-code-review auto-approval auto-approve auto-approve-bot auto-merge blast-radius claude-code code-quality code-review defect-prediction github-action github-actions mcp mcp-server merge-queue pr-risk-score pull-request-risk pull-requests risk-assessment risk-score

Floating `v0` release title (suggested):

    v0: opendrs PR risk score and blast radius (latest 0.x)

BLOCKER/UNVERIFIED: the public releases API has no release for tag v0 (`/releases/tags/v0` returns 404), though the tag `refs/tags/v0` exists. The floating release may be a draft or created by the release workflow at 0.7.0. Check Releases in the GitHub UI, or the workflow that moves v0, before "retitling". Latest published release is v0.6.0; 0.7.0 is not cut yet.

---

## B1. Anthropic plugin directory

- Route: developer portal https://claude.ai/directory/manage > "Submit new" > "Plugin bundle". Docs: https://claude.com/docs/plugins/submit and https://claude.com/docs/plugins/pre-submission-checklist
- Account: YES. A claude.ai account on a paid plan with a role that can submit (docs: portal "open to developers on paid Claude plans"), and the maintainer's GitHub account connected on claude.ai (needs push access to error-path/opendrs). Must accept the Anthropic Software Directory Terms and Policy. Maintainer step only.
- The portal reads listing text from the repo; there are no free-text name/description fields.

| Step | Field | Value |
|---|---|---|
| Source | Repository | `error-path/opendrs` |
| Source | Plugin path | `plugin` (the folder holding `.claude-plugin/plugin.json`; the repo root only has the marketplace file) |
| Source | Branch or tag | leave empty (follows `main`) |
| Source | Validate | run it; fix any "Blocks" finding, re-validate |
| Listing details | name | `opendrs` (from plugin.json) |
| Listing details | description | from plugin.json: "Blast radius and risk score (0-1) for every pull request. Lets AI-reviewed, low-risk PRs auto-approve into the merge queue while risky ones wait for a human. Skill + MCP server." |
| Listing details | long text | from `plugin/README.md` (282 words; the minimum is 40) |
| Data handling | personal data read or stored? | Reads the local repository's git history (commit author names and emails, used for author experience and reviewer suggestions), diff and source files on the user's machine. Writes only an import-graph cache under `.opendrs/`. Draft answer; confirm against the code. |
| Data handling | sends data to other services? | No for the plugin's MCP server and skill (runs locally; `npx` downloads the pinned package from npm). The optional LLM judge is a separate, off-by-default setting (docs/llm-judge.md): mention it. Verify before answering. |
| Data handling | retention | Nothing kept by opendrs outside the user's own repo cache |
| Data handling | for people under 18? | No |
| Compliance | contact email | maintainer's own address (not set here) |
| Compliance | acknowledgements | tick all four |
| Review and submit | new versions | "GitHub push webhook" (default; needs repo admin) |

- plugin.json on origin/main (read): name `opendrs`, version 0.6.0, description, author, license MIT, homepage and repository set. MCP command is `npx -y @error-path/opendrs@0.6.0 mcp`, exactly pinned, so it avoids the "Unpinned npx launcher" block. Expect a reviewer hold ("Runs a pinned npx or uvx package"); the checklist says this is always held, not a rejection.
- Run first, locally: `claude plugin validate ./plugin` from the repo root.
- Raise `version` in plugin.json with every release (the docs say to).
- Free: yes. Review time: not stated.

---

## B2. Cline MCP marketplace

- Route: open a GitHub issue in https://github.com/cline/mcp-marketplace with the "MCP Server Submission" template (https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml). Title prefix `[Server Submission]:`; label `server-submission` is applied by the template.
- Account: YES, a GitHub account (the maintainer's). Nothing else.

| Field | Required | Value |
|---|---|---|
| Title | prefilled | `[Server Submission]: opendrs` |
| GitHub Repository URL | yes | `https://github.com/error-path/opendrs` |
| Logo Image | yes | drag-drop the 400x400 PNG (resized `plugin/.claude-plugin/icon.png`) or paste an image URL |
| Installation Testing | yes, both boxes | "Cline can successfully set up the server using only the README.md and/or llms-install.md file" and "The server is stable and ready for public use". Tick only after really testing. |
| Additional Information | no | text below |

Additional Information text:

    opendrs is an MIT-licensed MCP server that scores a pull request or local diff from 0 to 1 using git history and the import graph. Run it with: npx -y @error-path/opendrs mcp (stdio, Node 22 or newer, no API key, no hosted service). Tools: score_diff, review_brief, self_check_items, explain_file_risk, list_hotspots, suggest_reviewers. It reads the git repository in the working directory. Also in the official MCP registry as io.github.error-path/opendrs. Why add it: it lets an agent score a change and get a review-first reading order before opening a PR. Site: https://error-path.github.io/opendrs/

- BLOCKERS/UNVERIFIED:
  (a) Cline's current docs page on MCP (docs.cline.bot/mcp/mcp-marketplace) does not mention a marketplace, and a search result says the newer VS Code extension no longer has the browse/install surface. The repo shows no archive banner and still has issues open. Confirm it still takes submissions before spending effort.
  (b) The "tested with Cline" boxes need a real test.
  (c) The repo has no `llms-install.md` (optional per the repo FAQ).
  (d) The logo must be resized to 400x400.

---

## B3. mcpservers.org

- Route: https://mcpservers.org/submit ("Submit Your MCP Server").
- Account: the page does not mention sign-in (unverified). It asks for a contact email.
- Choose the FREE plan (review within 2 weeks). Do NOT take Premium ($39 one time: badge, priority, "dofollow" link); paid links contradict the repo's own SEO note.
- The page does not mark which fields are required.

| Field | Value |
|---|---|
| Server Name | `opendrs` |
| Category (dropdown: Development, Productivity, Database, Search, Web Scraping, File System, Version Control, Communication, Cloud Service, Cloud Storage, Marketing, Finance, Design, Memory, Other) | `Development` (alternative: `Version Control`) |
| Short Description | `Open-source PR risk score and blast radius: a 0-1 score from git history to auto-approve low-risk PRs.` |
| Repository, Website or Documentation | `https://github.com/error-path/opendrs` |
| Official MCP Registry Name (optional) | `io.github.error-path/opendrs` |
| Supports remote connections | leave unchecked (stdio only) |
| Contact Email | maintainer's own address |
| Plan | Free |

- No long-description or tags field is shown, so LONG and tags are not used here.

---

## B4. AlternativeTo

- Route: sign up and verify email, then user icon (top right) > "Suggest new application" (https://alternativeto.net/faq). Progress under "My submissions". Account creation is the maintainer's step. Do not pay for priority review.
- Account: YES (sign-up plus verified email).
- FAQ rules: English only; no links, emails or phone numbers in the description (use the URL fields); declines unreleased apps, simple single-purpose online tools, thin wrappers around someone else's AI model, non-software; approval is at admin discretion and many are declined.
- The app form's full field list is behind sign-in. The FAQ names Platforms, License, Descriptions, Tags, links and Icon; the values below are for those.

| Field | Value |
|---|---|
| Name | `opendrs` |
| Short description | `Open-source PR risk score and blast radius that lets low-risk, AI-reviewed pull requests auto-approve.` |
| Description (no links) | the LONG text above |
| Platforms | Command line and GitHub Action, or the closest options offered (exact labels unverified) |
| License | Free, marked Open Source, source link `https://github.com/error-path/opendrs` (MIT) |
| Official website | `https://error-path.github.io/opendrs/` |
| Creator website | `https://github.com/error-path` |
| Icon | resized square PNG, at least 280x280 |
| Tags | pull-request, code-review, risk-score, auto-merge, mcp, github-actions, claude-code |

- Framing: docs/alternatives.md says opendrs is not a code reviewer and is designed to run after one. Do not set it as an alternative to CodeRabbit in general. If an "alternative to" link is added later on the app page, say it covers the approve-low-risk-PRs gate only.

---

## C. Changelog News

- Route: https://changelog.com/news/submit
- Account: YES. The page says "Please sign in / up to submit news" (links /in and /join). Maintainer step only.
- Rules: own work is "encouraged"; commercial products or services are not accepted; how-tos and tutorials are not wanted. opendrs is MIT open source and the repo docs mention no paid tier, so it fits. No length limit stated.
- Fields: URL* (required), Title* (required), "What's interesting about it?" (Markdown).

URL:

    https://github.com/error-path/opendrs

Title (changed from the draft's "open reproduction": README and alternatives.md say "independent open-source implementation" of the Diff Risk Score idea, and Meta's version is not released, so "reproduction" overclaims):

    opendrs: an open-source take on Meta's Diff Risk Score for pull requests

What's interesting about it? (paste as Markdown):

    I maintain this. opendrs gives each pull request a calibrated 0-1 risk score from git history and the import graph, so a team can auto-approve low-risk PRs after an AI review passes and leave the rest for a person. It runs as a GitHub Action, a CLI (`npx @error-path/opendrs score`) and an MCP server, with no API key or hosted service.

    The numbers I would look at: on the public ApacheJIT benchmark (official 2017-2019 test years), the calibrated score reaches AUC 0.823 and catches 67 % of buggy commits in its riskiest 30 %, on par with a regression on the classic JIT metrics (0.821, 66 %). Across 18 other repositories the untuned score ranked risk better than chance in 17 (median AUC 0.71); calibration helped in 11, was flat in 1 and hurt in 6. Labels mean "later needed a fix", not incidents. Method, per-repo tables and limits: [docs/results.md](https://github.com/error-path/opendrs/blob/main/docs/results.md).

Not quoted on purpose: DRS-OSS 0.895 (different split), Meta's 18.7 % / 27.9 % (analogy only), any "accuracy" or "hours saved" claim.

---

## Claim check

Verified: topics (live API call); plugin.json and server.json contents (origin/main); every number above against docs/results.md (0.823/67 %, 0.821/66 %, 17 of 18, median 0.71, 11/1/6); tools list (README); MIT license; 282-word plugin README; form fields and rules from the live pages fetched 2026-11-23.

Not verified: whether a v0 release exists; whether the Cline marketplace is still active; whether mcpservers.org needs a login; AlternativeTo platform and tag option labels (behind sign-in); Anthropic data-handling answers (drafted from the plugin README, confirm in code); whether the maintainer's Claude plan qualifies.

The local model (qwen 7B) draft was mostly discarded: it invented "supports nine repositories" and "lightweight". All text above was rewritten and checked by hand.
