# Outreach drafts for opendrs, 22 Nov 2026

Research and drafts only. Nothing here has been posted, sent, submitted or signed up for. The
maintainer reviews, edits and sends everything personally, with their own accounts.

Sources: web searches and page fetches on 22 Nov 2026. Items marked "unverified" came from a
search snippet only, or the page could not be fetched (Reddit, LibHunt and StackShare blocked the
fetcher). Re-check each rule on the live page before acting.

## Numbers allowed in any post (from docs/results.md and docs/alternatives.md only)

- ApacheJIT (official 2017-2019 test years, `apache/hadoop` left out): calibrated opendrs AUC
  0.823, 67 % of buggy commits in the riskiest 30 %; a regression on classic JIT metrics: 0.821, 66 %.
- Nine-repository run (opendrs v0.1.0, labels from reverts and SZZ, meaning "later needed a fix",
  not incidents): calibration beat the default priors on held-out commits in all nine; median AUC
  gain +0.04; on spring-boot and quarkus the gain is too small to matter.
- 18-repository run: untuned score ranked risk better than chance in 17 of 18 (median AUC 0.71;
  serde 0.51 is the exception). Calibration helped in 11, was flat in 1, hurt in 6.
- opendrs on its own PRs (#25-#90, to 2026-11-17): 54 scored, 31 green, 21 yellow, 2 red; 11
  auto-approved. Of 20 green not approved, 14 hit the self-modification guard. Single-maintainer
  sample, no incident labels: shows how the gate behaves, not how well the score predicts bugs.
- Do not quote: DRS-OSS 0.895 as a comparison (different split), Meta's 18.7 % / 27.9 % (analogy
  only), any "accuracy" or "saves X hours" claim.
- Benchmark link to offer: https://github.com/error-path/opendrs/blob/main/docs/results.md
  Comparison page: https://github.com/error-path/opendrs/blob/main/docs/alternatives.md
  Site: https://error-path.github.io/opendrs/

## Target table 1: "best X" list articles

"Date" is as shown on the page. "Lists similar?" means a PR risk score, auto-approve, or an open-source
reviewer. Most large roundups are written by vendors, so expect low odds there; the independent
authors (dev.to individuals, mcpservers.org) are the better asks.

| # | Article | Date | Lists similar tools? | Author type | How to contact |
|---|---|---|---|---|---|
| 1 | [Best AI code review tools in 2026: top 7 compared](https://dev.to/filiphric/best-ai-code-review-tools-in-2026-top-7-compared-2kll) | Jul 9 (year inferred 2026) | No risk score or auto-approve; 7 tools | Filip Hric, profile says DevRel at Qodo (vendor-affiliated) | dev.to comment or profile at dev.to/filiphric |
| 2 | [Best AI code review tools, April 2026 edition](https://dev.to/lewiska/best-ai-code-review-tools-april-2026-edition-4pp8) | Apr 22, 2026 | Yes: names Macroscope's auto-approve as the only autonomous approval on its list; no open-source tools | "Lewis" (dev.to/lewiska); discloses a Macroscope affiliation | dev.to comment or profile |
| 3 | [7 best CodeRabbit alternatives for AI code review in 2026](https://dev.to/rahulxsingh/7-best-coderabbit-alternatives-for-ai-code-review-in-2026-ko5) | Mar 15, edited Mar 22 (2026) | PR-Agent only as open source; no risk score or auto-approve | Rahul Singh; cross-posted from aicodereview.cc | dev.to comment or profile; original site aicodereview.cc (check its contact page) |
| 4 | [Best CodeRabbit alternatives in 2026](https://dev.to/hyraxai/best-coderabbit-alternatives-in-2026-2m05) | Aug 8 (year inferred) | No open source; own product listed first | HyraxAI company account | dev.to comment; hyrax.dev (low odds, vendor) |
| 5 | [9 best CodeRabbit alternatives in 2026 (open source + self-hosted)](https://kodus.io/en/coderabbit-alternative/) | Jul 2, updated Oct 12, 2026 | Yes: open-source section (PR-Agent, Semgrep, reviewdog); no risk score | Edvaldo Freitas, on Kodus's blog (vendor) | Footer contact on the page (support@kodus.io is a published company address) |
| 6 | [9 best pull request automation tools](https://www.greptile.com/content-library/best-pull-request-automation-tools) | Sep 14, 2026 | Mergify and others; no risk score tools | Everett Butler, Greptile (vendor) | greptile.com/contact |
| 7 | [10 open-source AI code review tools tested on a 450K-file monorepo](https://augmentcode.com/tools/open-source-ai-code-review-tools-worth-trying) | Jan 16, updated Aug 17, 2026 | Open-source reviewers only (PR-Agent, Kodus, LiveReview, shippie...); no risk score | Molisha Shah, Augment Code (vendor) | augmentcode.com/contact (no outside submission process listed) |
| 8 | [The best MCP servers in 2026](https://blog.mcpservers.org/posts/best-mcp-servers-2026) | Jul 11, 2026 | Lists GitHub MCP for PR review; no PR-risk MCP server | Elena Kovacs, mcpservers.org blog | No contact on the page; use the mcpservers.org directory (submission path not checked) |
| 9 | [Code review and pull request MCP servers (SonarQube, Codacy, CodeRabbit, Graphite, GitLab MR)](https://dev.to/grove_chatforest/code-review-pull-request-mcp-servers-sonarqube-codacy-coderabbit-graphite-gt-gitlab-mr-2fac) | Unknown (page fetch returned 404; unverified) | Review MCP servers; likely no risk-score server | dev.to account grove_chatforest | dev.to comment or profile |
| 10 | [Review is the bottleneck now: how we let AI approve pull requests (safely)](https://rewind.com/blog/ai-approve-pull-requests-safely/) | Jun 1, 2026 | Describes an in-house approver, names no third-party tool | Dave North, Rewind (company engineering post, not a list) | Rewind's website contact route; the page shows a work address, so prefer the site form |
| 11 | [Best CodeRabbit alternatives (OpenAlternative)](https://openalternative.co/alternatives/coderabbit) | Undated | Directory list of open-source alternatives | Directory | Submit via the directory (see table 3) |
| 12 | [CodeRabbit alternatives on AlternativeTo](https://alternativeto.net/software/coderabbit/) | Live page | Community list; add opendrs via the app page, not the author | Community | See table 3 |
| 13 | [Best pull request automation tools in 2026 (CodeAnt)](https://www.codeant.ai/blogs/best-pull-request-automation-tools-in-2026) | 2026 (unverified) | PR automation, vendor list | CodeAnt (vendor) | Site contact page (not checked) |
| 14 | [Merge queue comparison (Graphite guide)](https://graphite.com/guides/merge-queue-comparison-github-gitlab-graphite) and [Mergify comparison](https://mergify.com/alternative/github-merge-queue) | Undated (unverified) | Merge queue tools; vendor comparisons | Vendors | Skip: vendor comparisons rarely add outsiders |

Notes:
- Peers writing on PR risk scoring, worth reading, not pitching as list authors: PullGuard
  (dev.to/vladarbatov, May 18), pr-risk-scorer, difftriage, gitrisk, pr-impact, Koalr (commercial).
- Best-fit asks: rows 2, 3, 5, 8, 9. Rows 1, 4, 6, 7 are vendor blogs; a polite email is fine but expect nothing.
- No relevant independent "PR risk score tools" or "auto-approve low-risk PRs" list article was found. The
  results were company engineering posts (Rootly, Intercom, Vercel, Ona, Customer.io) and vendor docs.
  A neutral list there does not exist yet, which is a point for the docs/alternatives.md page.

## Target table 2: GitHub awesome-lists

| List | Fit for opendrs | Contribution rules found | Status |
|---|---|---|---|
| [joho/awesome-code-review](https://github.com/joho/awesome-code-review) | Has a Tools section (about 19 review tools) | Pull request; alphabetical order; one link per item, name as link text; short non-promotional description on the same line, ending with punctuation; at least 3 items to open a new category; Code of Conduct; edit the existing PR if changes are requested (contributing.md, fetched) | Verified |
| [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | opendrs ships an MCP server (`npx -y @error-path/opendrs mcp`) | Public GitHub repo for a server users run themselves; fork, branch, edit README.md, one line per server: name linked to repo plus concise description; alphabetical in the most relevant category (create one if none fits); follow README style; accurate, double-checked links; clear PR title and description (CONTRIBUTING.md, fetched). Category names not read, so check README first | Verified rules; category unverified |
| [sdras/awesome-actions](https://github.com/sdras/awesome-actions) | A "Pull Requests" category covers auto-approve and auto-merge actions | One PR per suggestion; search for duplicates; add to the end of the category; short one-line description, Title Case; `[Name](link)` format; descriptive PR title and commit (generic titles such as "Update readme.md" are closed); commit message body links the repo (contributing.md, fetched). Maintainers may expect a Marketplace/stable release, not checked | Verified |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | opendrs is a Claude Code plugin and skill | No PRs: use the web "recommend-resource" issue form, by a human (not the `gh` CLI, not an agent). Resource must be at least 14 days old with ongoing commits, or have 100 stars. One resource at a time. One-line description, no sales pitch, no emojis. The list is selective and says not to treat a listing as a core promotional strategy | Verified; opendrs's first commit was 15 Oct 2026, so it passes the 14-day rule |
| [ComposioHQ/awesome-claude-plugins](https://github.com/ComposioHQ/awesome-claude-plugins) | Plugin list | Rules not read | Unverified |

## Target table 3: free directories for open-source dev tools

| Directory | Submission page | Cost and rules found | Status |
|---|---|---|---|
| AlternativeTo | Sign up, verify email, then user menu > "Suggest new application" ([FAQ](https://alternativeto.net/faq)) | Free to submit; an optional paid priority review exists but is not needed; many submissions are declined; no links, emails or UTM tags in the description; do not use a user profile to advertise; no incentivised votes; the maintainer can later request developer access to the page. Account creation is the maintainer's step | Verified (FAQ) |
| OpenAlternative | https://openalternative.co/submit | Third-party sources say a free form exists with criteria (open source, actively maintained, clear alternative to a proprietary tool) and the site also sells paid packages (about $97-$197). The submit page text could not be read | Unverified; check the page for what is free |
| OpenSourceAlternatives.to | Form at /submit ([site](https://www.opensourcealternatives.to/)) | Has a submission form and marks sponsored listings; cost of a normal listing not stated | Partly verified |
| LibHunt | "Add a project" form with the GitHub URL ([libhunt.com](https://www.libhunt.com/)) | A third-party guide says free and no account; the site returned 403 to the fetcher | Unverified |
| StackShare | https://stackshare.io/tools/new (returned 429) | Not checked; hosted tool listing, mainly for tools companies use | Unverified |
| Console.dev | Submit page (check the site) | Developer-tool newsletter with a submission route; a third-party guide mentions it. Not checked | Unverified |

Do not pay for any listing, "dofollow" link package or submission service: this contradicts the
paid-link note in seo-research-2026-11-22.md.

## Outreach email template (list authors)

Subject: A possible addition to your "[title of their article]" list

Hi [first name],

I read your article "[title]" ([URL]) and found [one specific, true thing, e.g. "the open-source
section useful"].

Disclosure: I maintain opendrs, a small MIT-licensed tool, so I am not a neutral party. It gives
each pull request a calibrated 0-1 risk score from git history and the import graph, and can
approve low-risk PRs after an AI review passes. It is not a code reviewer; it is meant to run
after one. It runs as a GitHub Action, a CLI and an MCP server, with no service to host.

If it fits your list, the benchmark replays (ApacheJIT and 27 public repositories, with their
limits stated) are at https://github.com/error-path/opendrs/blob/main/docs/results.md and an honest
comparison with the other approval tools, including when not to use opendrs, is at
https://github.com/error-path/opendrs/blob/main/docs/alternatives.md.

No pressure at all. If it is out of scope, or if you spot an error in anything I wrote, I would
value hearing that just as much. Thanks for the article either way.

[Name], maintainer of opendrs
https://github.com/error-path/opendrs

Rules for use: one message per author, no follow-up chasing, never ask for a link or a ranking,
send from the maintainer's own address, no mass mailing. On dev.to use a plain comment with the same
disclosure instead of a message.

## Show HN draft

Framing check against docs/alternatives.md:

- "Open-source alternative to CodeRabbit" is NOT accurate. alternatives.md says to use CodeRabbit
  (or PR-Agent, Copilot, Claude Code) for review comments; opendrs is "designed to run after one of
  them" and "is not a code review". Do not use that title.
- Accurate framings: (a) "open-source implementation of the Diff Risk Score idea" (README: independent
  implementation following Meta's approach, which is not released); (b) narrowly, an open-source,
  self-run alternative to the approve-low-risk-PRs feature of hosted reviewers (CodeRabbit Merge Risk,
  Greptile, cubic, Cursor approval agents), where opendrs's differences are: runs in your CI, no
  service or API key, backtestable on your own history. Use (b) only with the word "approval" in it.
- Show HN fit: runnable with `npx` and no signup, so it qualifies. Post when ready to answer comments;
  do not ask anyone to upvote or comment. (Posting time advice in seo-research round 2: 12-17 UTC.)

Title (80 characters or fewer):

    Show HN: opendrs – open-source PR risk score to auto-approve low-risk PRs

Alternative title for framing (b):

    Show HN: opendrs – open-source alternative to hosted "merge risk" auto-approval

URL: https://github.com/error-path/opendrs

First comment:

> I maintain this. AI review now catches the local defects before a human opens a PR, so what
> reaches the human is a judgment call on design and risk with less context. opendrs is an
> independent open-source take on Meta's Diff Risk Score idea: a 0-1 score for each PR from git
> history (past fixes and reverts in the touched files, author experience with them), the import
> graph (blast radius), size, missing tests and critical paths. Every signal's contribution is
> shown in the PR comment. A team sets a policy, e.g. a green PR that passed an AI review is
> approved and sent to the merge queue; the rest wait for a person.
>
> Try it with no setup: `npx @error-path/opendrs score`. It also runs as a GitHub Action and an
> MCP server.
>
> What the numbers do and do not show. On the public ApacheJIT benchmark (2017-2019 test years) the
> calibrated model gets AUC 0.823 and 67 % of buggy commits in its riskiest 30 %; a regression on
> the classic JIT metrics gets 0.821 and 66 %, so it is on par, not better. On 27 open-source
> repositories, with labels from reverts and SZZ ("later needed a fix", not incidents), untuned it
> ranked risk better than chance in 17 of 18 repos, with one clear miss (serde, 0.51). Calibration
> helped in 11 of 18, was flat in 1 and hurt in 6, and in the nine-repo run it beat the default
> priors on held-out commits in all nine but by little on two. I would not trust a threshold before
> running `opendrs backtest` on your own history. On its own repository it scored 54 PRs: 31 green,
> 21 yellow, 2 red, 11 auto-approved. That is one maintainer and no incident labels, so it shows how
> the gate behaves, not how well it predicts bugs.
>
> Where it is the wrong tool: not on GitHub (only a GitHub Action exists), mostly dependency-update
> PRs (it never approves lockfile changes), code-owner review requirements, little history, risk that
> lives across services (the import graph is regex-based), and anything that needs "is this correct".
> There is a full comparison with Mergify, Greptile, cubic, CodeRabbit, Cursor, PR-Agent and others,
> including when to pick them instead: https://github.com/error-path/opendrs/blob/main/docs/alternatives.md
>
> Happy to hear where the signals are wrong for your codebase.

## r/devops draft

Rules check: the Reddit rules page could not be fetched (Reddit blocks the fetcher). Secondhand,
unverified: r/devops runs a weekly self-promotion thread, standalone promotion posts may be removed
and redirected to it, and disclosing that you built the tool is expected. Before posting: read the
live sidebar rules, and if they route tool posts to the weekly thread, put the short version
(title line plus 3 sentences plus links) there instead. Do not post from a new or empty account, and
do not cross-post the same text to several subreddits.

Title:

    How do you decide which PRs can skip human review? I built an open-source risk score for it (I maintain it)

Body:

> Disclosure up front: I maintain opendrs, an MIT-licensed tool for this. I am mostly after how
> other teams draw the line.
>
> Our situation: AI review now runs before a person looks at a PR, so humans mostly get the design
> and risk call. Rule-based approval (bot authors, labels, docs-only paths) is easy to audit but
> approves anything that matches, however large the change inside it. So I tried scoring each PR
> from measurable things instead: size, how many files depend on the changed ones, past fixes and
> reverts in those files, the author's experience with them, missing tests, critical paths. The
> score is a plain logistic model, each signal's contribution is shown in the PR comment, and the
> policy (for example "green and AI review passed, then merge queue") sits in a config file the PR
> itself cannot change.
>
> What I can honestly say about it: on the public ApacheJIT dataset it reaches AUC 0.823, on par
> with a plain regression on classic metrics (0.821). On 18 repos with no tuning it beat chance in
> 17, but calibration hurt in 6 of them, so it needs a backtest on your own history. Labels are
> "later needed a fix", not real incidents. On our own repo, 11 of 54 PRs were auto-approved; it is
> a one-person sample. It does not work for dependency-bump-heavy flows (Renovate or Dependabot
> automation is better) or for non-GitHub hosts.
>
> Questions for you: what would make you trust an auto-approval gate (a shadow mode? a backtest? a
> hard path blocklist)? Which PR types do you never want skipping review?
>
> Try it: `npx @error-path/opendrs score`. Repo: https://github.com/error-path/opendrs. Numbers and
> limits: https://github.com/error-path/opendrs/blob/main/docs/results.md

## Awesome-list PR descriptions

Each is for the maintainer to open, with their own GitHub account, one PR per list, after reading the
list's current README. Entries below follow each list's stated format.

### punkpeye/awesome-mcp-servers

Branch: `add-opendrs`. PR title: `Add opendrs (PR risk score MCP server)`

Entry (alphabetical, in the closest category after reading the README, likely a developer-tools or
version-control section):

    - [error-path/opendrs](https://github.com/error-path/opendrs) - Scores a git diff or pull request 0-1 for risk (blast radius, file history, tests) and returns a review brief, hotspots and reviewer suggestions; runs locally over stdio with no API key.

PR description:

> Adds opendrs, an MIT-licensed MCP server (`npx -y @error-path/opendrs mcp`, or Docker over stdio).
> Tools: `score_diff`, `review_brief`, `self_check_items`, `explain_file_risk`, `list_hotspots`,
> `suggest_reviewers`. It runs locally against a mounted repository, with no hosted service or API
> key. I am the maintainer. I checked that the repo is public, the link works, the entry is
> alphabetical in its category, and the description matches the README. Happy to change the category
> or wording.

### sdras/awesome-actions

PR title: `Add opendrs PR Risk Score and Blast Radius to Pull Requests` (one PR for this single suggestion).

Entry (end of the "Pull Requests" category, Title Case, one line):

    - [opendrs PR Risk Score and Blast Radius](https://github.com/marketplace/actions/opendrs-diff-risk-score) - Comments a 0-1 risk score on each pull request and can approve and auto-merge low-risk ones.

PR description:

> Adds opendrs, a Marketplace action that scores each pull request from git history and the import
> graph, labels it green, yellow or red, and optionally approves low-risk PRs and enables auto-merge
> or the merge queue. Approval is off until the repository enables it in `.opendrs.yml`. I am the
> maintainer. I searched the list for duplicates and put the entry at the end of the category. The
> commit message body links the repository.

(The Marketplace link is in the README. If the list prefers the repository link, use
`https://github.com/error-path/opendrs`.)

### joho/awesome-code-review

PR title: `Add opendrs to Tools`

Entry (alphabetical inside Tools, non-promotional, ends with a full stop):

    - [opendrs](https://github.com/error-path/opendrs) - Open-source tool that scores each pull request's risk from git history and the dependency graph, to decide how much human review it needs.

PR description:

> Adds opendrs to the Tools section. It is a review-triage tool, not a reviewer: it measures a PR's
> blast radius and risk and tells the final human how much attention it needs. MIT licensed, runs as a
> CLI, GitHub Action or MCP server. I am the maintainer; the entry is alphabetical with one link and
> a one-line description, per contributing.md. The list has no risk-triage entry today, so I think it
> adds something, but happy to drop it if it is out of scope.

### hesreallyhim/awesome-claude-code (issue form, not a PR)

Submitted by a human through the web "recommend-resource" form; not by `gh` and not by an agent.
Form fields (adapt to the live form):

- Resource: opendrs, https://github.com/error-path/opendrs
- One-line description (no sales pitch, no emoji): Claude Code plugin and skill that scores a diff's risk (blast radius, file history, missing tests) and returns a review brief, with an MCP server.
- Eligibility: first commit 15 Oct 2026, so older than 14 days, with ongoing commits.
- Disclosure: I am the maintainer.
- Install: `/plugin marketplace add error-path/opendrs`, then `/plugin install opendrs@opendrs`.

## Order I would do it in

1. Show HN or the dev.to follow-up first (one disclosed write-up), then answer comments for a day.
2. The three PR-based awesome-list entries and the AlternativeTo listing (each is quick and free).
3. Emails to authors in rows 2, 3, 5 and 8 only, after the awesome-list PRs are open (so there is
   something to link). Skip vendor roundups unless there is time.
4. r/devops last, once the disclosure and numbers have survived comment scrutiny elsewhere.
5. Change one thing at a time and re-run the agent-visibility benchmark before the next step.

## List articles that the search services return most (measured 22 Nov 2026)

From the benchmark's raw runs (Bing, Tavily, Exa, Google in six countries): "best tools" articles
that appear in the top 5 results across many queries and services. These are the pages AI agents
read before recommending, so they are the best outreach targets. Counts are top-5 appearances.

| Article | Appearances | Services |
|---|---|---|
| mastra.ai/articles/ai-code-review-tools | 39 | 8 |
| gitkraken.com/blog/6-best-pull-request-review-tools-for-enterprise-teams-in-2026 | 16 | several |
| deepsource.com/resources/ai-code-review-tools | 12 | several |
| warpway.ai/guides/ai-code-review-tools-that-approve-pull-requests | 11 | several |
| cubic.dev/info/task/blog/ai-platforms-pull-request-risk-triage | 10 | several |
| sourcegraph.com/blog/automated-code-review-tools | 9 | several |

Also frequent and often recommended by the model: `ona.com/stories/auto-approving-low-risk-prs`
(an article on the same idea; a natural place for a comment or a note to the author) and
`mcpmarket.com/server/opendrs` (the MCP directory listing, recommended 6 times on Bing).
Lists by companies that sell a code review product (deepsource, cubic, sourcegraph, gitkraken) are
less likely to add an outside tool. Checked 22 Nov 2026: mastra sells an agent framework, not a
code review product, and does not list itself, so it is the best first ask. warpway is not neutral:
its own pages (search titles "Auto-approval · Warpway", warpway.ai/docs/auto-approval) show it sells
PR auto-approval and gating; the site returned 503, so its article text is unread. Details below.

## Per-target notes (checked 22 Nov 2026)

Fetched once each on 22 Nov 2026. "Sells a competitor" means a code review, approval or merge
product. Contact routes are only those published on the page or site; no personal emails guessed.

| Article | Publisher, author, date | Sells a competitor? | Tools listed | opendrs fits? | Public contact route | Verdict |
|---|---|---|---|---|---|---|
| mastra.ai/articles/ai-code-review-tools | Mastra; Sam Bhagwat; published 13 Aug 2026, no update date | No: agent framework, "Factory" and hosting; not in its own list | CodeRabbit, Copilot code review, Qodo, Greptile, Graphite Agent, SonarQube Cloud | Partly: list is of reviewers; opendrs is a step after one. It notes Copilot comments neither approve nor block merges, which is the gap opendrs covers | mastra.ai/contact; @mastra on X; company GitHub. No author profile linked, no suggest-a-tool route | Worth asking: most-cited page, neutral publisher; odds still modest, as opendrs is not a reviewer |
| gitkraken.com/blog/6-best-pull-request-review-tools-for-enterprise-teams-in-2026 | GitKraken; Jade Nangah; 16 Sep 2026 | Yes: ranks itself first | GitKraken, LinearB, CodeScene, Code Climate, Jellyfish, Waydev | Poor: metrics and review workspaces, no approval tools | gitkraken.com/contact (general) | Skip: self-ranked vendor list in another category |
| deepsource.com/resources/ai-code-review-tools | DeepSource; no author; "Last updated: March 2026" | Yes: ranks itself first | DeepSource, CodeRabbit, Greptile, Graphite, Cursor Bugbot, Amazon CodeGuru, Copilot code review | Poor: reviewers only | Contact Sales only | Skip: vendor list, sales route only |
| warpway.ai/guides/ai-code-review-tools-that-approve-pull-requests | Warpway; author and date unread (503 on 3 tries) | Yes, from its own page titles: auto-approval docs and a "gating and routing PR reviews" product | Unread | Topic fits exactly, but it is a direct competitor | Unread | Skip: direct competitor; re-check the page if it comes back up |
| cubic.dev/info/task/blog/ai-platforms-pull-request-risk-triage | cubic; no author, no date | Yes: cubic is "Top Pick", and sells auto-approval | cubic, Corgea, Warestack, Bito | Topic fits (risk triage), publisher competes | None on the page | Skip: direct competitor |
| sourcegraph.com/blog/automated-code-review-tools | Sourcegraph; Matt Tanner; 30 Sep 2026 | Partly: lists its own Code Search and MCP server, disclosed ("This one's ours"); no approval product | Qodo, CodeRabbit, Greptile, Copilot, Sourcegraph; SonarQube, Codacy, Semgrep, DeepSource, Snyk Code; open source: ESLint, Pylint, RuboCop, PMD, Reviewdog, Danger | Partly: an open-source section and a section on adopting AI review without losing reviewer trust | Only sourcegraph.com/contact/request-info (a sales form); no public author profile found | Low odds: vendor blog, only a sales form to reach it |
| ona.com/stories/auto-approving-low-risk-prs | Ona; Benjamin Stark; 9 Apr 2026 | Yes: sells AI code review (its agent approves the PRs) | None outside Ona; low risk is six fixed rules (under 1,000 lines, no protobuf, migrations, infra/CI, auth or audit-log changes) | Same idea, but an engineering story, not a list | No comments; Contact sales and a general contact page | Low odds: no list to join; good reading for the rule-based vs risk-scored point in docs/alternatives.md |

### Note for mastra.ai (Sam Bhagwat), for the maintainer to send via a public route

> Hi Sam, I read "6 Best AI Code Review Tools for Pull Requests in 2026"; the pilot section is
> practical. Disclosure: I maintain opendrs, an MIT-licensed tool, so I am not neutral. It is not a
> reviewer and would not belong in your six. It runs after one: it scores each PR 0-1 for risk from
> git history and the import graph (a logistic model, no LLM needed) and can approve low-risk PRs
> once the AI review passes. You note that Copilot's comments neither approve nor block merges; that
> is the step it covers. On the public ApacheJIT benchmark it reaches AUC 0.823, on par with a
> classic regression (0.821): https://github.com/error-path/opendrs/blob/main/docs/results.md
> No pressure either way.
