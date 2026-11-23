# Regional research: Europe, UK/Ireland, Australia/NZ and little-known platforms (23 Nov 2026)

Round 6 of the SEO research. Rounds 1-5 ([seo-research-2026-11-22.md](seo-research-2026-11-22.md))
used US-centric sources. Three research agents (Sonnet, about 20 searches each) looked at where
developers in other regions find tools, and what they say about AI code review. Nothing was
signed up for, posted or sent. Rows marked "unverified" rest on search snippets only.

## Ranked by deadline, then fit

| # | What | Region | Deadline | Why | Source file section |
|---|---|---|---|---|---|
| 1 | Programmable 2027 CFP (Sydney, 18 Mar 2027), Cloud & Tools or Security track, free on Sessionize | AU | **27 Nov 2026, 5pm AEDT** | Only CFP closing this week | ANZ |
| 2 | DevOpsDays Zurich 2027 CFP (14-15 Apr), experience report, no vendor talks | CH | 31 Dec 2026 | Open and verified | EU |
| 3 | Cloud Native Melbourne speaker call | AU | 31 Dec 2026 (unverified) | Platform audience | ANZ |
| 4 | LeadDev LDX3 London 2027 CFP opens Dec 2026; editorial pitches any time | UK | Dec 2026 to Jan 2027 | Engineering leaders own review policy | UK |
| 5 | State of Open Con 2027 (London, 9-10 Feb), check if a call is open | UK | Check now | Open-source audience | UK |
| 6 | New page: "Risk-tiered approval as change evidence" for regulated teams (see below) | UK, EU, AU | None | Same angle came up in all three regions | all |
| 7 | LinuxFr.org technical article (French; moderated, no ads or minor releases) | FR | None | Free, large FOSS readership | EU |
| 8 | Claim the Glama listing and check its A-F scores; check cursor.directory and MCP Market's free queue | Global | None | Cheap, MCP-native | ANZ |
| 9 | London DevOps AI meetup (10.7k members, code review bottlenecks is a theme); message the organiser | UK | None | Exact topic fit | UK |
| 10 | FrOSCon 2027 Call for Projects (free booth/devroom), FINOS Open Source in Finance Forum London, FOSDEM 2028 | DE, UK, BE | Spring 2027 | Later | EU, UK |

## The angle all three regions share

Regulators and public bodies talk about change control, not about "AI review":
- UK: the FCA found change approval boards approved over 90% of major changes, and those failed
  about twice as often; GDS guidance pairs human peer review with branch protection.
- EU: DORA wants ICT changes recorded and approved; the Product Liability Directive (due
  9 Dec 2026) treats software as a product; an EU Futurium post argues "human approval is not
  human oversight".
- AU: APRA's 30 Apr 2026 letter says AI-assisted development strains change and release controls
  and expects human involvement for high-risk decisions; the ISM (Sep 2026) covers AI-assisted
  development.

A page could position opendrs as a deterministic, logged tier for low-risk PRs that sends people
to the risky ones. Say "supports" or "can provide evidence for", never "complies with": no source
says automated approval counts as evidence, and UK GDS still expects a human to review merges.
Most EU sources are law-firm or vendor commentary, not regulator guidance.

## Cautions

- Codeberg voted to ban mostly AI-generated repositories: do not mirror opendrs there unchecked.
- Lobsters needs an invite and limits self-promotion; PulseMCP has paused submissions.
- No paid listings (MCP Market fast-track, Premium tiers).
- Not checked for lack of budget: ITBrief, techAU, Web Directions, PyCon AU, SaaSHub, Slant, LibHunt,
  Open VSX, local newsletters in NL, PL, CZ, the Nordics and Spain.

---


## Agent notes: continental Europe

### Continental Europe research for opendrs (as of 2026-11-23)

Method: ~19 WebSearch (standard) + 8 WebFetch. "Verified" = I fetched the page itself. "Snippet" = search-result summary only, unverified. No listings were paid; nothing was posted or contacted.

### (1) Channels

| Name | Country / language | URL | What it is | How to get listed / featured (free? rules?) | Fit | Verified? |
|---|---|---|---|---|---|---|
| LinuxFr.org | FR, French | https://linuxfr.org/proposer-un-contenu | Largest French FOSS news/forum site | Free account. Types: depeche (moderated), journal (no moderation, free-form), lien, forum. Purely commercial/advertising depeches rejected. Per moderation rules (https://linuxfr.org/moderateurs/moderation.html): minor releases rejected, new-project announcements only if genuinely innovative or with real editorial content, author-submitted content OK if credited and under a free license. MIT fits. Best route: a journal post (discussion tone), or a depeche written as a technical article (git-history risk scoring), not a release note. | Med | Yes (both pages fetched) |
| Journal du hacker | FR, French | https://www.journalduhacker.net/ | Hacker News-style voted link aggregator for French content | Link submission, voting. Home page shows "Demander une invitation", so an account may need an invite (not confirmed). Self-promotion rules not found; the About page was not in the fetch. Needs French-language content (a French README section or blog post). | Med | Partial (site fetched; rules not visible) |
| Le Courrier du hacker | FR, French | https://linuxfr.org/news/le-courrier-du-hacker-lettre-d-information-hebdomadaire-resumant-l-actualite-foss-francophone | Weekly Friday newsletter, selects top-voted Journal du hacker links; reported 2,500 to 4,500 subscribers (sources differ) | No submission form. Reach it by getting upvoted on Journal du hacker. Free. | Med | Snippet only |
| FOSDEM 2027 (Brussels, 30-31 Jan 2027) | BE, English | https://fosdem.org/2027/news/call-for-devrooms/ | Largest European FOSS conference | Devroom proposals closed 4 Oct 2026 and main-track CFP deadline was 16 Nov 2026 (per search result; fetched page says main-track CFP "opens around 27 Oct" with no deadline). Remaining route: submit a talk to an accepted devroom that is still taking CFP (each has its own CFP; some close around 20 Nov). Free. Candidate rooms to check: CI/CD, software supply chain, security, AI. Realistic only as an attendee or hallway demo for 2027; plan FOSDEM 2028 (devroom call usually Sept). | Med (2028) | Yes (dates), room list not checked |
| DevOpsDays Zurich 2027 (Winterthur, 14-15 Apr 2027) | CH, English | https://sessionize.com/devopsdays-zurich-2027/ | Local DevOps conference, ~250 attendees | CFP open until 31 Dec 2026 23:59 CET. 25-min talks, 5-min Ignite talks, workshops. Topics include platform engineering, tools, AI. Pure vendor talks not allowed, so frame as an experience report ("what 18 months of risk-scored PRs showed"), not a product pitch. Free to submit. | High | Yes |
| DevOpsCon / MLCon / AI Engineering Summit (Amsterdam, 19-23 Apr 2027) | NL, English | https://sessionize.com/devopscon-mlcon-ai-engineering-summit-2027 | Commercial conference | CFP closes 7 Dec 2026 (search result). Speakers usually are not charged. Short deadline. | Med | Snippet only |
| Other DevOpsDays 2026/27 (Graz, Prague, Krakow, Vilnius, Geneva, Barcelona, Amsterdam, Eindhoven) | AT/CZ/PL/LT/CH/ES/NL | https://www.devopsdays.org/speaking | Network of local DevOps conferences, each with its own CFP (pretalx, sessionize or talks.devopsdays.org) | Free. Each city has its own dates and CFP. Only Zurich 2027 was found open. Set a watch on the others for 2027. | Med | Snippet only (list); Zurich verified |
| Incontro DevOps Italia 2027 | IT, Italian/English | https://sessionize.com/incontro-devops-italia-idi-2027 | Italian DevOps conference | Sessionize CFP. Deadline not checked. | Med | Snippet only |
| FrOSCon (Sankt Augustin, DE; 4-5 Sept 2027) | DE, German/English | https://froscon.org/en/cfp/cfprojects/ | Community FOSS conference | Separate "Call for Projects": a free booth or devroom for FOSS projects, no fee mentioned. 2026 deadline was 23 May; 2027 call not open yet (check froscon.org/en/news in spring 2027). Good low-pressure fit: booth plus a talk. | High | Yes (2026 call fetched; 2027 dates from snippet) |
| Open Source Summit Europe (Prague, 7-9 Oct) | CZ, English | https://events.linuxfoundation.org/open-source-summit-europe/program/cfp/ | Linux Foundation event | Year not confirmed in the result. CFP is free but competitive. | Low-Med | Snippet only |
| Nordic Tech Days 2027 (Tallinn) | EE/Nordics, English | https://sessionize.com/ntd-2027 | Merged Nordic DevOps/testing event | Sessionize CFP. Deadline not checked. | Med | Snippet only |
| Engineering Kiosk (podcast) | DE (German), covers OSS and engineering culture | https://podnews.net/podcast/iaw4p | Podcast | Show notes list stehtisch@engineeringkiosk.dev for contact. Free. I did NOT contact anyone. | Med | Snippet only |
| programmier.bar (podcast) | DE, German | https://pocketcasts.com/podcasts/2b25ff20-24bd-0136-c266-7d73a919276a | Web/app dev podcast | Topic requests via mail, Discord, Mastodon, Bluesky. Contact details inconsistent across sources. | Low-Med | Snippet only |
| heise developer / iX | DE, German | https://heise.de/-11205497 (example article) | Main German dev press. Covers AI code review (Anthropic Code Review, Copilot reviews) | No submission route found. Earned media by editorial pitch only. Hook: heise already covers "AI reviews PRs"; the "who approves it" angle (auto-approve with a risk score) is untouched in what I found. | Med | Snippet only (article titles) |
| golem.de, t3n, Tweakers, computerwoche | DE/NL | https://t3n.de/tag/open-source/ | General tech press. t3n says it is tied to open source "since founding in 2005" | No submission route found for any. Treat as pitch-only. Low fit for a niche CLI. | Low | Snippet only |
| openCode (ex Open CoDE, ZenDiS) | DE, German/English | https://opencode.de/en/frequently-asked-questions | German public-sector code platform and software catalogue | Creating projects is reserved for public administration staff and contractors, so a foreign commercial or independent project cannot self-list. Free. Not a fit unless a German agency adopts opendrs. | Low | Yes |
| EU OSS Catalogue (Interoperable Europe) | EU, English | https://interoperable-europe.ec.europa.eu/eu-oss-catalogue | EU catalogue of solutions "by and for European public services" | No direct submission. It ingests national or local catalogues that meet criteria (relevance, activity, licence, community). Route is indirect. | Low | Yes |
| publiccode.yml / Developers Italia | IT, Italian/English | https://developers.italia.it/en/reuse/publication | Italian public-sector catalogue. Its crawler imports any repo with a root `publiccode.yml` | Free and automatic: add `publiccode.yml` to the repo root. Mandatory only for Italian public software, so it is a cheap optional extra (aimed at public-sector adopters). Standard: https://github.com/italia/publiccode.yml | Low-Med | Snippet only |
| NLnet / NGI Zero Commons Fund | NL, English | https://nlnet.nl/news/2026/20260903-call.html | EUR 5k-50k grants for open internet projects | Free to apply. Commons Fund final call closed 1 June 2026. NLnet reportedly paused regular calls pending NGI Zero evaluation, then a call with deadline 3 Nov 2026 was announced (title only; I did not fetch it). Check https://nlnet.nl/propose/ and https://nlnet.nl/commonsfund before drafting. A dev-tooling project fits their "trustworthy software" theme only loosely. | Low-Med | Snippet only, and the snippets conflict |
| Codeberg / Forgejo | DE, English | https://itsfoss.com/news/codeberg-bans-ai-contributions/ | German non-profit Git host (Forgejo) | CAUTION. Codeberg voted (358 for, 144 against) to ban repositories "mostly" written by generative AI, and Forgejo does not accept AI-authored contributions. The proposal to ban LLM content in PRs/issues (https://codeberg.org/Codeberg/Community/issues/2914) was still a proposal in results. Do not mirror opendrs there without checking that its AI-assisted authorship does not conflict. Audience will be sceptical of "AI PR" framing. | Low (risk) | Snippet only |
| Hacker-News-like / national aggregators outside FR (Lobsters-style NL/PL/CZ/Nordic) | various | n/a | Searches found none worth reporting | No verified local aggregator found for DE/NL/PL/CZ/Nordics/ES/IT. Local-language sources are mostly press or conferences. | n/a | Not found |
| Mastodon dev instances | various | n/a | Search found no verifiable dev-instance discussion | Not verified. Skipped. | n/a | Not found |

Gaps: no verified Poland, Czechia, Nordics, Spain, Portugal or Netherlands local forums or newsletters (the one search covering them returned only daily.dev, a global aggregator). Not covered: heise submission route, Dutch/Polish newsletters, Mastodon.

### (2) Regional angles and ideas

1. **EU Product Liability Directive.** Directive 2024/2853 treats software and AI as products, and Member States must transpose it by 9 Dec 2026. Liability attaches to defects, including security holes, and AI-generated code does not reduce it (Heuking, 12 Oct 2026: https://www.heuking.de/de/news-events/newsletter-fachbeitraege/artikel/vibe-coding-rechtsfragen-und-haftungsrisiken-ki-erzeugter-software.html). Page idea: "Evidence that a risky change got a human and a safe one did not." The score plus decision log is a documentation trail. A CIO.de piece frames this as "who doesn't document, is liable" (https://www.cio.de/article/4136549/ai-macht-unternehmen-haftbar-ein-wendepunkt-fuer-compliance.html), but it is commentary and other sources dispute personal liability for managers.
2. **DORA change management for banks and insurers.** Article 9 (as summarised by Red Gate: https://www.red-gate.com/blog/why-digital-operational-resilience-act-dora-compliance-requires-auditable-database-change-management/) requires ICT changes to be recorded, assessed, approved and verified "regardless of how produced". Vendor material says the chain must trace to a named human (https://jfrog.com/ja/blog/devgovops-enables-dora-compliance/). Eurofi reports 38% of major bank incidents in 2025 had "IT change" as root cause (https://www.eurofi.net/wp-content/uploads/2026/03/cyber-and-digital-operational-resilience-eurofi-nicosia-march-2026.pdf). Message: opendrs should NOT claim "replaces human approval"; position as "risk-tiering evidence: low-risk goes through a recorded automated gate, high-risk gets a named human". All vendor or commentary sources, not regulator guidance.
3. **"Human approval is not human oversight."** An EU Futurium post argues that a recorded approval does not prove effective oversight, and that rubber-stamping is the failure mode (https://futurium.ec.europa.eu/sk/apply-ai-alliance/community-content/human-oversight-not-same-human-approval). This supports an angle: a risk score focuses human attention on the PRs that need it, instead of blanket approval. Caveat: Article 14 (https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14) concerns high-risk AI systems, not coding tools. Do not claim AI Act compliance.
4. **AI Act timeline confusion.** German sources disagree on dates: full application in Aug 2026 versus Digital Omnibus pushing high-risk obligations to 2 Dec 2027 (https://www.boerse-express.com/news/articles/eu-ai-act-hochrisiko-ki-systeme-bekommen-bis-dezember-2027-zeit-921899 - low-quality source). Avoid any date claims on the site. Link only to the official EU text.
5. **Rubber-stamp fatigue is also a European open-source story.** Codeberg coverage links the AI policy to maintainers drowning in low-quality PRs and automated "looks good to me" approvals (https://linuxiac.com/codeberg-bans-projects-mostly-written-by-generative-ai/). A "deterministic, no-LLM, explainable score" message may land better with this audience than with US "AI reviewer" tools. Emphasise "no LLM, no code leaves the runner".
6. **Self-hosting / data residency.** Search found no source that proves self-hosting is the preferred answer to German or Austrian AI code-review privacy concerns. WKO (Austria) only says GDPR applies even to tools you did not build (https://www.wko.at/ki-datenschutz), and one German article puts IP protection above GDPR (https://mind-verse.de/news/ki-gestuetzte-code-reviews-chancen-herausforderungen-softwareentwicklung). The idea is plausible (opendrs reads only git history, no code sent to a model), but it is my inference. Treat as hypothesis to phrase carefully: "runs in your CI, sends nothing to a third party".
7. **Vercel precedent shows the adversarial risk a European audit would ask about.** Vercel auto-approves LOW-risk PRs (58% of PRs in its largest monorepo) and its post names the classifier's user-controlled input as an attack surface (https://vercel.com/blog/58-percent-of-prs-in-our-largest-monorepo-merge-without-human-review.md). A "threat model" docs page for opendrs (what an attacker controls in git history) would answer the question EU security reviewers will ask. US source, but it matches what compliance-minded teams need.
8. **Four-eyes principle (Vier-Augen-Prinzip).** GitHub's German docs describe required approving reviews (https://docs.github.com/de/enterprise-server@3.18/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews). Messaging idea: German-language FAQ answering "does auto-approve break the four-eyes principle?" and explaining how the approved-output/auto-merge gate (opendrs PR #108) leaves branch protection intact. Needs German-speaking review before publishing.

### Verification limits

- Dates in this file come from fetched pages where marked "Yes"; others from search snippets.
- NLnet status contradictory across snippets (paused vs open call with 3 Nov 2026 deadline); do not rely on it.
- Journal du hacker invitation requirement and self-promotion rules are unconfirmed.
- Contact addresses were taken from snippets and never used.


## Agent notes: UK and Ireland

### Regional research: UK and Ireland (as of 2026-11-23)

Verified = page fetched. "Snippet" = search result only, unverified.

### 1. Channels

| Name | URL | What it is | How to get in (cost / rules / deadlines) | Fit | Verified? |
|---|---|---|---|---|---|
| LDX3 London 2027 (LeadDev) | https://leaddev.com/leaddev-call-proposals | Engineering-leadership conference, 2,500+ audience | Page says CFP opens Dec 2026 (register for updates). Speakers get honorarium, accommodation, training. Vendor-talk rules not stated. Also: articles pitched to editorial team, no deadline. London 2026 CFP closed 4 Jan 2026 (snippet), so expect an early-January close. Event dates 2027 not on page (a snippet says 28-29 June, unverified) | High | Yes (page) |
| LeadDev editorial / articles | https://leaddev.com/leaddev-call-proposals | Pitch articles via editorial team | No deadline; free | Med-High | Yes |
| NDC London 2027 | https://sessionize.com/ndc-london-2027/ | .NET-rooted but broad (AI, platform eng, testing), 25-29 Jan 2027 | CFP CLOSED 30 Aug 2026. Free for speakers, travel paid. Watch for the 2028 call (opened 22 May this year) | Low now / Med later | Yes |
| State of Open Con 2027 (OpenUK) | https://openuk.uk/events/ | UK open source conference, London, 9-10 Feb 2027 (FOSDEM fringe) | No 2027 Sessionize page found. 2025 call ran 19 Nov to 15 Dec 2024 on Sessionize, so a late call or lightning slot is possible. Watch sessionize.com/state-of-open-con-2027 (guess, unverified) | Med-High (MIT, open source) | Dates from snippet only; 2025 call page seen in snippet |
| Open Source in Finance Forum London (Linux Foundation / FINOS) | https://events.linuxfoundation.org/open-source-finance-forum-london/program/cfp/ | Open source for banks, London. 2026 was 25 June | 2026 CFP closed 15 Mar. Free pass per accepted talk. Rules: finance-specific only, NO product/sales pitches, no closed-source. Topics include AI governance, developer tools, open source security. Expect 2027 CFP about Jan-Mar | High (audit evidence angle) | Yes (page) |
| London DevOps AI meetup | https://www.meetup.com/london-devops-ai/ | 10,733 members, relaunched with AI focus; one theme is "Tackling Code Quality and Review Bottlenecks". Events #001 (30 Sep) and #002 (21 Oct) | How to speak not stated. Message organiser Matt Saunders via Meetup (not done). Free | High | Yes (page) |
| Platform Engineering London meetup | https://www.meetup.com/platform-engineering-london/ | Platform engineering group | Unknown | Med | Snippet only |
| Platform Nation London (Luma) | https://luma.com/7qohs01e | AI + platform engineering evening for eng leaders | Unknown | Med | Snippet only |
| Bond AI London "Agentic Coding Done Right" | https://luma.com/agentic-coding2 | Agentic coding meetup, agenda includes review workflows | Unknown | Med | Snippet only |
| Cloud Native Dublin | https://sessionize.com/cloud-native-dublin-october-2026/ | Dublin meetup, topics include platform eng, DevEx, CI/CD. Calls run roughly 3 weeks, several times a year | Free, Sessionize, all experience levels. 2026 calls closed; next likely early 2027 | Med | Snippet only |
| Azure & GitHub Community Day Dublin | https://sessionize.com/azure-github-community-day/ | Dublin, 10 Nov 2026 (past) | Closed 24 Oct. Watch for 2027 | Med (GitHub Action fit) | Snippet only |
| SREcon26 EMEA, Dublin | https://www.usenix.org/conference/srecon26emea/call-for-participation | USENIX SRE conference, held 13-15 Oct 2026 | Past; 2027 location unknown | Low | Snippet only |
| The Register / DevClass | https://www.theregister.com/2026/03/09/anthropic_debuts_code_review/ | Register covers AI code review (Anthropic launch, March 2026). DevClass not surfaced by search | No submission route found; news pitch only | Med | Register article in snippet; DevClass unverified |
| UK podcasts: LeadDev PriorityZero, hackajob DevLab, Talks With Tech Leaders, London Tech Insider | e.g. https://castbox.fm/channel/LeadDev's-PriorityZero-id6232353 | UK-leaning dev/leadership shows | Guest process unknown | Low-Med | Snippet only |
| GDS AI Engineering Lab / gov tech blogs | https://cddo.blog.gov.uk/2026/01/12/join-ai-engineering-lab-and-help-shape-the-future-of-digital-government | Cross-gov community around AI coding assistants | Open to civil servants; outside route unclear | Med (audience, not a listing) | Snippet only |
| Home Office engineering standards | https://engineering.homeoffice.gov.uk/standards/use-ai | Public standard on AI coding assistants | Reference/citation target | Med | Snippet only |

Not found: a UK-specific tool catalogue, Tech Nation-style list, UK engineering-manager newsletter with a submit route, or a DevOpsDays London 2026/27 CFP (only 2017-2022 pages, snippet). DevOpsDays London 2026 page may exist at devopsdays.org (unverified).

### 2. Regional angles

- **GDS tells departments to pair human review with main-branch protection and to code in the open** (updated Dec 2025). opendrs is MIT and open, and a risk-routed review fits "keep commits small, protect main". Page idea: "Branch protection plus risk score for AI coding assistants in government". Source: https://www.gov.uk/government/publications/ai-insights/ai-insights-ai-coding-assistants-for-developers-in-hmg-html . Caution: that guidance expects human peer review of merges; auto-approve must be framed as "low-risk goes to a lighter path", not "no human".
- **FCA says CABs rubber-stamp.** The FCA's review found CABs approved over 90% of major changes (some never rejected any), major changes failed about twice as often (3.8% vs 1.6%), and firms still rely on manual testing and peer review. It also found automated deployers had higher success rates. Message: "evidence-based change risk instead of a CAB flight-control role". Caveat: it is a 2021 document, and it says automation does not remove manual oversight. Source: https://fca.org.uk/publications/multi-firm-reviews/implementing-technology-change
- **Change risk score as ITIL "standard change" evidence.** Several sources propose risk-tiered approval (pre-authorised low-risk, normal changes with SME approval). Write an "opendrs as standard-change eligibility check" page. Sources (secondary, vendor/blog): https://dev.to/beefedai/moving-from-cab-to-automated-guardrails-and-itsm-integration-fao , https://www.securityscientist.net/blog/12-questions-and-answers-about-change-approval-automation-in-high-velocity-teams/
- **Gartner (Apr 2026) "The End of Your Change Advisory Board"** is a hook for talk titles (paywalled abstract only). Source: https://www.gartner.com/en/documents/7712557
- **SM&CR means a named person stays accountable for AI outcomes**, with no separate AI senior manager (law-firm briefing, secondary). Messaging: opendrs outputs a deterministic, reproducible score with the inputs listed, which supports an accountable human signing off a policy rather than each PR. Needs an "audit evidence" doc. Source: https://www.bclplaw.com/en-US/events-insights-news/ai-regulation-in-financial-services-turning-principles-into-practice.html . Related: FCA AI good/poor practice https://www.fca.org.uk/publications/good-poor-practice/ai-financial-services ; Risk.net "Regulators question human-in-the-loop as AI governance tool" https://www.risk.net/node/7963553 (paywall, snippet title only).
- **"No LLM needed" is a regulated-sector selling point.** UK/EU regulators are wary of opaque AI approvers. Evidence should be "reproducible, attributable, durable" (vendor post, treat with caution): https://dev.to/mickai/ai-in-financial-services-after-the-bank-of-england-paper-and-the-audit-that-survives-pra-scrutiny-12ip
- **DORA (EU) puts AI-generated code inside existing ICT change management**, with no exemption (fintech article, snippet). Applies to UK firms with EU operations; relevant to Irish firms. Source: https://www.fintechfutures.com/ai-in-fintech/how-to-introduce-ai-into-a-regulated-engineering-organisation
- **NHS: no guidance found on AI-generated code under DCB0129/0160**; NHS England is reviewing those standards and commentary says they were not designed for AI. A possible gap to comment on, but low evidence. Sources: https://www.england.nhs.uk/long-read/national-review-of-clinical-risk-management-standardsdcb0129-and-dcb0160-supporting-information/ , https://www.digitalhealth.net/2025/08/we-need-to-act-fast-to-close-the-nhs-ai-safety-gap/

### 3. Dated opportunities
- LDX3 London 2027 CFP: opens Dec 2026 (page). Likely closes early Jan.
- State of Open Con, London, 9-10 Feb 2027: check for CFP or lightning slots now.
- FINOS Open Source in Finance Forum London 2027: CFP probably Jan-Mar (extrapolated from 2026).
- London DevOps AI meetup: meetups roughly monthly (Sep 30, Oct 21).


## Agent notes: Australia, New Zealand and little-known platforms

### opendrs: ANZ and niche global channels (researched 2026-11-23)

Verified = I read the page itself (WebFetch) or an official page via search. "Unverified" = search snippet or third-party blog only.

### 1. Channels

| Name | Region | URL | What it is | How to get listed | Fit | Verified? |
|---|---|---|---|---|---|---|
| Programmable 2027 (Sydney, 18 Mar 2027) | AU | https://sessionize.com/programmable-2027-sydney/ | Dev conference. Tracks include Cloud & Tools, Security, Data/Intelligence & the Developer. 40-min and 20-min "Express" talks | CFP via Sessionize. **Closes 27 Nov 2026 5pm AEDT (4 days).** Speakers get free ticket plus 2 extras, travel/accommodation considered. Free to submit | High (timing) | Yes |
| Everything Open 2027 (Brisbane, 20-22 Jan 2027) | AU | https://2027.everythingopen.au/news/call-for-sessions/ | Linux Australia open-source conference | Call for Sessions appears closed (official pages disagree on state); check https://2027.everythingopen.au/programme/proposals/ | Med (OSS, MIT fit; probably too late) | Partly |
| YOW! (Tech Leaders Melbourne/Sydney, Brisbane 2026) | AU | https://yowcon.com/tech-leaders-melbourne-2026/pages/callforsubmissions | Engineering leader / dev conference | 2026 Melbourne CFP closed 28 Feb 2026. Brisbane page has "Nominate a Speaker". No open call found; watch for 2027 | Med | Partly (search snippet) |
| CloudCon SYD / GDG Melbourne DevFest / Cloud Native Melbourne | AU | https://sessionize.com/cloud-native-melbourne | Sessionize CFPs. Cloud Native Melbourne meetup CFP open to 31 Dec 2026 | Free CFP form. Meetup talk is a low-bar way to present to platform engineers | Med-High (Cloud Native Melbourne) | Snippet only, unverified |
| DevOpsDays Australia/NZ, DDD Melbourne/Perth, Web Directions, PyCon AU, KiwiCon | AU/NZ | (none found) | Named in brief | Searches returned no 2026/27 open CFP for any of these. Wollongong 2025 DevOpsDays CFP only (https://devopsdays.org/events/2025-wollongong/propose/) | Unknown | Not found. Not verified either way |
| Platform Engineering NZ (Meetup, Auckland) | NZ | https://www.meetup.com/platform-engineering-nz/ | Monthly meetup: networking, talk, Q&A. Recent topics: AI and golden paths | Contact organisers for a talk slot. I did not contact anyone | High | Snippet only, unverified |
| Cloud Native Auckland / Serverless Auckland / Full-Stack Engineering Auckland (has a Discord) | NZ | https://www.meetup.com/full-stack-engineering-auckland/ | Meetups; Full-Stack Eng Auckland lists a Discord and "Agentic Engineering Day NZ" (21-22 Oct 2026) | Join and ask. Do not spam | Med | Snippet only, unverified |
| iTnews (nextmedia, AU) | AU | https://www.itnews.com.au/tag/developers | Enterprise IT news (banks, gov). Developers tag is mostly 2012-2020 content; no dev-tool beat | Contact (/page/contact), Editorial Guidelines (/page/editorial-guidelines). No tip form on the page | Low-Med (a case study with an AU bank would fit; a tool launch would not) | Yes (tag page read) |
| What The Tech (AU podcast) | AU | https://substack.com/profile/421195767-what-the-tech-au | AU tech podcast | Unknown | Low | Snippet only, unverified |
| ITBrief, techAU | AU | not checked | Named in brief | Not researched (search budget) | Unknown | No |
| NZ gov open source (NZGOAL-SE, dns.govt.nz) | NZ | https://data.govt.nz/toolkit/policies/nzgoal/nzgoal-se-guidance-note-2 | NZ agencies publish code on GitHub orgs. Guidance note says no central NZ catalogue or discovery portal exists | Nothing to list on. Use as outreach list: https://github.com/opennewzealand, https://dns.govt.nz/standards-and-guidance/digital-service-design-standard/principles/work-in-the-open | Low (no catalogue) | Yes (search results) |
| AU gov code catalogue (DTA) | AU | none found | Searched once, no result | Not found | Unknown | Not found |
| Official MCP Registry | Global | https://registry.modelcontextprotocol.io/v0/servers?search=opendrs | Upstream registry that feeds Smithery, PulseMCP and others | **opendrs already listed**: io.github.error-path/opendrs, 0.1.5 to 0.7.0, latest 0.7.0 titled "PR Risk Score (opendrs)" | Done | Yes |
| mcp.so | Global | https://mcp.so/search?q=opendrs | MCP directory | **opendrs already listed** ("Opendrs", PR blast radius analyzer) | Done | Yes |
| Glama | Global | https://glama.ai/mcp/servers?query=opendrs | MCP directory, auto-scrapes GitHub, scores A-F on licence, quality, maintenance | **opendrs already listed** (tools score_diff, self_check_items, list_hotspots, suggest_reviewers). Gap: claim the listing in Glama admin and check A grades. A grades in all three are required for the awesome-mcp-servers badge (per https://dev.to/kfuras/glama-clones-your-repo-smithery-proxies-your-http-mcpso-wants-a-markdown-line-18f5) | High (claim) | Yes |
| Smithery | Global | https://smithery.ai | MCP directory. Publish via `smithery mcp publish` or the dashboard | Status unknown: my search URL 404'd. Snippet source claims proxy shut down 31 Oct 2026 and the site is now a directory. Registry-fed listings may exist | Med | Unverified |
| PulseMCP | Global | https://www.pulsemcp.com/submit | MCP directory | **Submissions paused**. Page says it will ingest from the official registry on reopening. opendrs is on that registry, so it should be picked up | Done by proxy | Yes |
| cursor.directory | Global | https://cursor.directory/mcp/new (per third-party snippet) | Cursor community catalogue | GitHub sign-in, free. One source says submission is a fork plus PR. Cursor also has a separate marketplace publish route (cursor.com/marketplace/publish) | High | Unverified |
| MCP Market | Global | https://mcpmarket.com/submit | MCP directory | Free queue plus paid fast-track ($29 vs $39 per different blogs). **Skip the paid tier (brief says no paid listings).** The free queue is fine | Med | Unverified |
| OpenTools | Global | https://opentools.com/registry | Tool registry with web form | Details unknown | Low-Med | Unverified |
| Lobsters | Global | https://lobste.rs/about | Invite-only, computing-focused link site | Needs an invite. Accounts under 70 days cannot submit self-promo, "show", "announce", or "vibecoding" tags. Self-promo should be under about 25% of your activity. Only post if a trusted member invites you and the blog post is technical | Med (low if no invite) | Yes |
| Tildes ~comp | Global | https://tildes.net/~tildes/26k/policy_on_self_promotion | Small discussion site | Self-posting allowed but "shouldn't be the only thing you post". Free open-source work is tolerated. Informal 10% norm | Low-Med | Partly (search) |
| Mastodon: Fosstodon / Hachyderm | Global | https://hub.fosstodon.org/coc/ and https://community.hachyderm.io/docs/account-types/open-source-accounts/ | Instances where devs post | Fosstodon: own-work posts are welcome. Commercial promotion, link-only posts, excessive hashtags barred. Hachyderm: project accounts only for MIT-style OSS without a single corporate owner. Project bot accounts not allowed. Personal posts fine | Med | Partly (search) |
| Newsletters (TLDR, Pointer, Bytes) | Global | https://www.console.dev/about | Console takes suggestions by email (skip, already emailed). No editorial submission route found for TLDR, Pointer, Bytes (only sponsorship contacts) | Not worth paid sponsorship | Low | Unverified |
| GitHub Marketplace category pages, Open VSX, SaaSHub, Slant, LibHunt, OSS Insight | Global | n/a | Named in brief | Not researched (search budget) | Unknown | No |

### 2. Angles and ideas

- **Programmable 2027 CFP closes 27 Nov 2026.** A "Cloud & Tools" or "Security" talk fits, for example "Auto-approving low-risk AI PRs with change evidence". Source: https://sessionize.com/programmable-2027-sydney/
- **APRA 30 April 2026 letter on AI.** It says AI-assisted development "is straining change and release management controls". It says traditional change management is "not sufficient", and it expects "robust security testing across AI-generated code". It also expects human involvement for high-risk decisions and continuous monitoring proportionate to criticality. A page titled "Risk-tiered approval: humans on high-risk PRs, auto-approve on low-risk" maps directly. Source: https://apra.gov.au/news-and-publications/apra-letter-industry-artificial-intelligence-ai
- **Law-firm commentary on the same letter** says point-in-time sampling fails for AI and recommends continuous validation. opendrs could pitch "per-PR score logged as audit evidence". Source: https://www.claytonutz.com/insights/2026/may/apras-ai-letter-a-shift-from-framework-to-targeted-expectations
- **ISM (September 2026) guidelines for software development** explicitly cover "AI-assisted, AI-powered and AI-driven software development". They require changes tied to issue-tracker decisions, documented security design decisions, and SAST/DAST/SCA on artefacts. An "ISM-aligned PR approval evidence" page could cite these controls. opendrs is not SAST, so position it as the review-routing layer, not a replacement. Source: https://cyber.gov.au/ism/2026-09/guidelines-for-software-development
- **Messaging caution.** APRA and ASD text does not say automated approval is acceptable evidence. Phrase pages as "supports", never "complies with CPS 230 / CPS 234". I found no source that maps CPS 230 / CPS 234 to PR approval (Clayton Utz and EY discuss AI risk generally). Source: https://www.ey.com/content/dam/ey-unified-site/ey-com/en-au/insights/financial-services/documents/ey-letter-to-industry-on-ai.pdf
- **Claim and polish existing MCP listings rather than submitting new ones.** Glama claim and grade check, cursor.directory (not confirmed listed), MCP Market free queue. PulseMCP should ingest from the official registry later.
- **Auckland platform-engineering meetups are the lowest-friction audience** (Platform Engineering NZ, Cloud Native Auckland, Full-Stack Eng Auckland Discord). Offer a short talk; do not cold-post. Source: https://www.meetup.com/platform-engineering-nz/
- **Low-value or restricted:** Lobsters needs an invite and bans new-account self-promo; Tildes tolerates occasional free-OSS posts; newsletters other than Console show no editorial submission path.

### 3. Gaps

ITBrief, techAU, Web Directions, PyCon AU, KiwiCon, Slack communities, GitHub Marketplace categories, Open VSX, SaaSHub, Slant and LibHunt were not checked. I did not sign up, post or contact anyone.

