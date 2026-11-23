# Outreach drafts, round 6 (23 Nov 2026)

Drafts only: nothing here was posted, sent or submitted. Each needs the maintainer's own account,
and LeadDev rejects mostly AI-written text, so rewrite that pitch in your own words. Talks:
the maintainer speaks remotely only, and none of these three CFPs mentions remote talks, so the
proposals are kept for later. Research behind them:
[regional-research-2026-11-23.md](regional-research-2026-11-23.md).

## Outreach drafts, round 6 (nothing posted or sent)

Numbers come only from docs/results.md (origin/main, fetched 2026-11-23). The local model (qwen2.5-coder) failed on the French piece ("fetch failed") and its English drafts were unusable ("outperforming" the baseline is false: 67 % vs 66 % is on par; no limits stated), so all drafts below were written and checked by hand.

Numbers allowed: ApacheJIT calibrated AUC 0.823 vs 0.821 (regression on classic JIT metrics); 67 % vs 66 % of buggy commits in the riskiest 30 %; 15 Apache Java projects, test years 2017-2019, hadoop left out (no positive labels); 18-repo run: untuned score beats chance in 17 of 18, calibration helped in 11, flat in 1, hurt in 6; own repo: 54 PRs scored (31 green, 21 yellow, 2 red), 11 auto-approved.

Before using any of it: LeadDev runs an AI-detection tool and rejects mostly AI-generated pieces. The maintainer must rewrite the LeadDev pitch and article in their own words. The same is wise for every channel.

---

## 0. Routes and blockers (summary)

| Channel | Route | Account | Blocking rule |
|---|---|---|---|
| LinuxFr.org | https://linuxfr.org/proposer-un-contenu | Journal: yes (free account). Depeche: can be sent anonymously but gets extra scrutiny | Depeches: purely commercial/advertising rejected, minor releases rejected, new-project announcements rejected unless innovative; author content must be under a free licence and credited. Journal fits better |
| LeadDev | https://leaddev.com/get-involved/become-a-published-author-with-leaddev (online form, no pitch email) | Not stated | Mostly AI-generated text is rejected (AI detector). Vendor rules not stated. $250 honorarium |
| London DevOps AI | https://www.meetup.com/london-devops-ai/ (Message link next to organisers) | Meetup account, probably need to join the group | How to propose a talk not stated; past events all in person; remote not mentioned |
| Tildes | https://tildes.net (~comp) | Yes; I believe invite-only (not verified on the fetched page) | Informal policy only: be a person with a project, not a promotional account; do not make it your only activity |
| Fosstodon | https://fosstodon.org, code of conduct https://hub.fosstodon.org/coc/ | Yes, on that instance | No link-only promo, no excessive hashtags, no commercial promotion, no bots |

---

## 1. LinuxFr.org

### Which type fits

Rules read: https://linuxfr.org/proposer-un-contenu and https://linuxfr.org/moderateurs/moderation.html.

- Depeche: moderated. Rejected: purely commercial or advertising items, press-release style, minor version announcements, short or poorly written text, duplicates. New sites or projects are not approved unless long established or genuinely innovative. Author-submitted content is accepted if the author is credited, it is under a free licence and follows the editorial charter. The pages do not name the licence (check the submit form or legal notice before sending; do not assume).
- Journal: personal posts by authenticated users, for discussion and information that do not fit a depeche. The pages I fetched do not say whether journals are moderated.
- Verdict: send it as a journal. It is a retour d'experience about a young project, not news, and a depeche about a new project is likely to be rejected. If the maintainer wants a depeche, the text below is already written as a technical article, but expect the "new project" objection.

Tags: `git`, `revue_de_code`, `logiciel_libre`, `securite`.

### Titre

Noter le risque d'une pull request Ã  partir de l'historique git, sans LLM

### Article (Markdown)

Bonjour,

Je maintiens opendrs, un outil sous licence MIT qui attribue Ã  chaque pull request un score de risque entre 0 et 1, calculÃ© Ã  partir de l'historique git du dÃ©pÃ´t. Ce journal est un retour d'expÃ©rience : ce que l'outil mesure, pourquoi il se passe de LLM, comment on le rÃ¨gle sur un dÃ©pÃ´t, et ce que les mesures montrent ou ne montrent pas. Ce n'est pas un relecteur de code.

## Pourquoi

Quand des agents Ã©crivent et relisent une partie du code, la relecture humaine devient le goulot : tout passe par quelques personnes. Or la plupart des PR sont peu risquÃ©es, et peu de PR causent la plupart des incidents. L'idÃ©e, inspirÃ©e du Â« Diff Risk Score Â» publiÃ© par Meta, est d'estimer le risque de chaque changement pour que les PR peu risquÃ©es, dÃ©jÃ  passÃ©es en revue par une IA, puissent Ãªtre approuvÃ©es automatiquement, et que les autres attendent une personne. Meta n'est pas liÃ© au projet : c'est une rÃ©implÃ©mentation indÃ©pendante, qui tourne dans n'importe quel dÃ©pÃ´t git, sans service Ã  hÃ©berger.

## Les signaux

Le score est une rÃ©gression logistique sur des signaux tirÃ©s du dÃ©pÃ´t. Pour chaque PR :

- la taille du changement (lignes modifiÃ©es, rapportÃ©es Ã  la taille des fichiers ; verrous, fichiers gÃ©nÃ©rÃ©s et dÃ©pendances embarquÃ©es exclus) ;
- la dispersion : nombre de fichiers, de rÃ©pertoires, d'auteurs distincts dans l'historique des fichiers touchÃ©s ;
- l'historique des fichiers : correctifs et reverts passÃ©s dans une fenÃªtre donnÃ©e, incident enregistrÃ© ;
- l'expÃ©rience de l'auteur : a-t-il crÃ©Ã© ou Ã©crit l'essentiel des fichiers, combien de commits antÃ©rieurs ;
- la complexitÃ© des fichiers touchÃ©s (une heuristique sur les mots-clÃ©s de branchement, indÃ©pendante du langage) ;
- le rayon d'impact : les dÃ©pendants transitifs des fichiers modifiÃ©s (profondeur 3) d'aprÃ¨s le graphe d'imports, et les symboles exportÃ©s modifiÃ©s ;
- les chemins critiques que vous dÃ©clarez, et les tests manquants ou supprimÃ©s.

Chaque signal indique comment il a Ã©tÃ© obtenu (observÃ©, dÃ©rivÃ©, infÃ©rÃ© ou inconnu) et la preuve associÃ©e. Un signal inconnu, par exemple le graphe d'imports pour un langage non gÃ©rÃ©, n'est jamais traitÃ© comme Â« sÃ»r Â» : la politique le compte comme du risque. La contribution de chaque signal au score est affichÃ©e, donc on voit pourquoi une PR a obtenu telle note.

## Pourquoi pas de LLM

Le score ne dÃ©pend ni d'une clÃ© d'API ni d'un service : il se calcule en local ou en CI Ã  partir du dÃ©pÃ´t, il est reproductible, et on peut le rejouer sur l'historique pour le mesurer. Un Â« juge Â» LLM existe en option, mais il ne peut que relever le score, jamais le baisser. Un LLM juge ce qu'il lit dans le diff ; l'historique dit autre chose, par exemple qu'un fichier a Ã©tÃ© corrigÃ© plusieurs fois rÃ©cemment, ou que personne d'autre que l'auteur n'a jamais touchÃ© ce module.

## Le calibrage

LivrÃ© tel quel, le modÃ¨le utilise des poids a priori fixÃ©s Ã  la main. La commande `opendrs calibrate` ajuste les poids sur l'historique du dÃ©pÃ´t, et `opendrs backtest` rejoue les commits passÃ©s pour comparer le modÃ¨le par dÃ©faut et le modÃ¨le calibrÃ©, sur les commits les plus rÃ©cents que le calibrage n'a pas vus. Les Ã©tiquettes (Â« ce commit a nÃ©cessitÃ© un correctif plus tard Â») viennent des reverts et d'une attribution de type SZZ des commits de correction. Si vous tenez un fichier d'incidents, il fournit une meilleure Ã©tiquette. Les seuils (vert, jaune, rouge) peuvent Ãªtre des scores absolus ou des percentiles de votre propre historique.

## Ce que disent les mesures

Sur ApacheJIT, un jeu de donnÃ©es public de projets Java d'Apache (15 projets, annÃ©es de test 2017 Ã  2019 ; hadoop est Ã©cartÃ© faute d'Ã©tiquettes positives), le modÃ¨le calibrÃ© atteint une AUC de 0,823 et attrape 67 % des commits bugguÃ©s dans ses 30 % de commits les plus risquÃ©s. Une rÃ©gression logistique sur les mÃ©triques classiques de la littÃ©rature obtient 0,821 et 66 %. Autrement dit : Ã  Ã©galitÃ©. Je ne prÃ©tends pas faire mieux, seulement obtenir le mÃªme niveau avec des signaux lisibles et un modÃ¨le qui s'ajuste Ã  votre dÃ©pÃ´t.

Sur 18 dÃ©pÃ´ts libres supplÃ©mentaires, sans aucune configuration, le score classe les commits corrigÃ©s plus tard mieux que le hasard dans 17 cas sur 18 (serde est l'exception). Le calibrage a aidÃ© dans 11 dÃ©pÃ´ts, n'a rien changÃ© dans 1 et a fait pire dans 6 : sur de petites fenÃªtres de test, les chiffres sont bruitÃ©s. Il faut lancer `backtest` sur son propre dÃ©pÃ´t avant de se fier Ã  un seuil.

Enfin, sur le dÃ©pÃ´t d'opendrs lui-mÃªme, l'action a notÃ© 54 PR : 31 vertes, 21 jaunes, 2 rouges, et 11 PR vertes ont Ã©tÃ© approuvÃ©es automatiquement. C'est un petit Ã©chantillon Ã  mainteneur unique, sans Ã©tiquettes d'incident : il montre comment la barriÃ¨re se comporte, pas si le score prÃ©dit les bogues.

## Limites

- Les Ã©tiquettes sont des approximations : Â« a eu besoin d'un correctif Â» n'est pas Â« a causÃ© un incident Â».
- Les petits dÃ©pÃ´ts donnent des rÃ©sultats instables ; les poids par dÃ©faut ne sont pas ajustÃ©s Ã  votre code.
- Le score estime un risque, pas la correction du changement. Il ne remplace pas la relecture, humaine ou automatique.
- Le graphe d'imports ne couvre que quelques langages (TypeScript et JavaScript, Python, Go, Java et Kotlin, Rust, Ruby) ; ailleurs, le rayon d'impact est Â« inconnu Â».

## Essayer

```
npx @error-path/opendrs score
npx @error-path/opendrs calibrate
npx @error-path/opendrs backtest
```

Le code, la documentation et les tableaux de rÃ©sultats sont sur https://github.com/error-path/opendrs (licence MIT). Les retours sur le choix des signaux, les Ã©tiquettes et les erreurs de mÃ©thode sont bienvenus.

### English summary for the maintainer

- Send it as a journal (retour d'experience), not a depeche: LinuxFr rejects commercial items, minor releases and new-project announcements unless innovative. A journal needs a free LinuxFr account.
- The text covers signals, why no LLM, calibrate/backtest, and results from docs/results.md only: ApacheJIT 0.823 vs 0.821 and 67 % vs 66 % (stated as "on par"), 17 of 18 repos beat chance untuned, calibration helped 11 / flat 1 / hurt 6, own repo 54 PRs with 11 approved. Limits have their own section.
- Check before posting: (a) the ApacheJIT label description is deliberately vague; docs/calibration.md (outside my allowed sources) has the exact labelling. (b) The import-graph language list is from docs/signals.md. (c) Read the licence your submit form applies; the moderation page only says "free licence". (d) Be present to answer comments.

---

## 2. LeadDev

Route: https://leaddev.com/get-involved/become-a-published-author-with-leaddev. It is an online article-submission form, not an email. The form asks for: working title, brief introduction, proposed main-body structure, key takeaway for senior engineering leaders, how it differs from existing articles, up to five keywords, plus name, contact and location, job title and company, third-person bio, optional headshot, LinkedIn URL, writing samples, second author or not. Wanted: personal experience with takeaways, case studies, essays on how AI is changing engineering. Honorarium $250. Not accepted: mostly AI-generated content (AI detector). Length, vendor-promotion rules and account need are not stated. Questions: hello@leaddev.com (the page's mailto actually points to hello@whiteoctoberevents.co.uk, so confirm which). The email below doubles as the form text and as a note to ask first.

### Subject

Pitch: Routing code review by risk when AI writes the PRs

### Email

Hello,

I would like to pitch an experience report for engineering leaders: what changes about code review once AI agents write and review much of the code.

I maintain opendrs, an MIT-licensed tool that gives every pull request a 0-1 risk score and blast radius from git history, with no LLM involved. On my own repository it scores each PR; low-risk PRs that passed an AI review are approved automatically and the rest wait for a person. Of 54 scored PRs, 11 were auto-approved.

The piece is about the policy decisions, not the tool: what a risk score can and cannot vouch for, why AI review of AI-written code is not independent review, and where a person still has to look. I will state the limits plainly: one small single-maintainer sample, labels that are later fixes rather than incidents, and a score that is not a code review.

An outline is below. I will write the full draft myself.

Thank you,
[Name], maintainer of opendrs (https://github.com/error-path/opendrs)

### Five-point outline

1. The bottleneck moved: when agents write and review, the scarce resource is a human's attention.
2. Not every PR deserves the same review: most are low risk, a few cause most incidents. Which history signals a leader can read (size, spread, past fixes, author experience, blast radius).
3. What AI review does and does not vouch for: it catches local defects, adds little independent judgment on design, so the final human needs different information.
4. Building the routing policy: thresholds from your own history, hard blocks (security paths, workflow changes), caps, an audit trail. What I measured: public benchmark (calibrated AUC 0.823, on par with a classic-metrics regression at 0.821) and my own PRs (54 scored, 11 auto-approved), with the limits.
5. What leaders should decide first: who owns the thresholds, what happens when a low-risk PR breaks something, how to track false confidence, and when not to automate at all.

---

## 3. London DevOps AI meetup

Route: https://www.meetup.com/london-devops-ai/, "Message" link beside the organiser list (Matt Saunders plus three others). A free Meetup account is needed. The page does not say how to propose a talk, lists no upcoming event, and past events were in person, so remote is a request, not something they offer.

### Message

Hi Matt,

I saw the group's theme on code review bottlenecks. I maintain opendrs, an open-source (MIT) tool that gives each pull request a risk score from git history, so low-risk PRs that already passed an AI review can be approved and risky ones go to a person.

Could I offer a 15-20 minute talk? It would be an experience report: how I route review by risk on my own repository, the measurements I have, and where it falls short. It is not a product pitch, and the tool is not a code reviewer.

I am, so I would join remotely if that is possible. If you only host in person, I understand.

Thanks,
[Name]

---

## 4. Tildes and Fosstodon

### Tildes (~comp)

Rules checked: https://tildes.net/~tildes/26k/policy_on_self_promotion. There is no written rule; the thread says it is fine to be a person with a project, not a project with an account, and self-posts should not be everything you post. Post only if the maintainer takes part in the community normally. Accounts need an invite as far as I know (not verified here).

Title: Experience report: scoring pull-request risk from git history, no LLM (open source)

Body:

I maintain a small MIT tool, opendrs, and wanted to share what I learned rather than just link it.

It gives each PR a 0-1 risk score from git history (size, spread, past fixes in the touched files, author experience, dependents in the import graph, missing tests). The goal is routing: low-risk PRs that already passed an AI review can be approved, the rest wait for a person.

What I measured: on the public ApacheJIT benchmark, calibrated AUC is 0.823 against 0.821 for a regression on the classic JIT metrics, so on par, not better. On 18 other repositories the untuned score ranked later-fixed commits above chance in 17. Calibration helped in 11, was flat in 1 and hurt in 6. On its own PRs it scored 54 and auto-approved 11.

Limits: labels are reverts and later fixes, not incidents; my own sample is tiny and single-maintainer; and it is not a code reviewer, it only estimates how much attention a change needs.

Repo: https://github.com/error-path/opendrs. I would like to hear which signals you would distrust.

### Fosstodon

Rules checked: https://hub.fosstodon.org/coc/. Sharing your own projects is encouraged; commercial promotion, link-only promo posts and excessive hashtags are barred; bots are barred (post from the maintainer's own account and reply to people).

Post:

I maintain opendrs, an MIT tool that gives each pull request a 0-1 risk score from git history, no LLM. Experience report: on ApacheJIT it matches a classic-metrics regression (AUC 0.823 vs 0.821), not beats it. Labels are later fixes, not incidents. Not a code reviewer. Critique welcome: https://github.com/error-path/opendrs #OpenSource #CodeReview #Git


---

## opendrs conference talk proposals (drafts, NOT submitted)

First drafts came from the local model (qwen2.5-coder 7b). They were generic and near-identical, so every proposal below was rewritten and checked by hand against docs/results.md (origin/main). Page facts were checked on 2026-11-23 against the live Sessionize pages (raw HTML, not only a summary).

Numbers used (all from docs/results.md): opendrs's own repo, PRs #25-#90 opened 2026-10-18 to 2026-11-17 (data as of 2026-11-20): 54 scored (31 green, 21 yellow, 2 red), 11 auto-approved, 14 of the 20 unapproved green PRs hit the self-modification guard, both red PRs touched security-sensitive action code. ApacheJIT: calibrated AUC 0.823 vs 0.821 for logistic regression on classic JIT metrics. Do not write "18 months" (the regional-research note says that; the data covers one month). The Sessionize pages state no title or abstract character limits; abstracts below are kept under 900 characters.

## Attendance decision table

| | Programmable 2027 (Sydney) | DevOpsDays Zurich 2027 (Winterthur) | Cloud Native Melbourne |
|---|---|---|---|
| Deadline (verified) | 27 Nov 2026, 5:00 PM AEDT (UTC+11). Page shows "4 days left". Opened 4 Sep 2026 | 31 Dec 2026, 11:59 PM CET (UTC+1). Opened 1 Oct 2026 | Page says the call is open year-round and closes 09 Nov 2027 (opened 01 Jan 2026). It also shows a contradictory "finished 7 days ago" banner, so treat as rolling and ask the organiser. The research note's "31 Dec 2026" is NOT confirmed |
| Event | 18 Mar 2027, Sheraton Grand Sydney Hyde Park | 14-15 Apr 2027, Alte Kaserne, Winterthur, ~250 people, single track, English | Meetups through the year, dates "to be defined", partner venues in Melbourne CBD/Docklands |
| In person / remote | Not stated explicitly; venue plus hallway and speaker-lounge wording imply in person. No remote option mentioned | In person (single-track venue event). No remote option mentioned | In person, Melbourne ("in person, on our scheduled dates"). No remote option mentioned |
| Travel / accommodation | "Requests for travel and accommodation expenses will be considered as part of your speaker proposal". Also "we'll help with domestic travel and accommodation if you need it". Cover for a trip from abroad is therefore a request, not a promise. Speaker gets a ticket, 2 extra tickets and speaker lounge | Not stated on the page. Ask the organisers before submitting | Not stated. Organisers offer help shaping the topic, slide review and demo rehearsal |
| Formats / limits | 40 min full session, or 20-min "Programmable Express" (max 5 slides). Tracks: Programming Languages; Cloud & Tools; Security: Fortifying the Future; Digital Product & Startup Dev Stories; Data, Intelligence & the Developer. No char limits stated | 25 min + 5 min Q&A; 5-min Ignite (20 auto-forwarding slides); workshop. Max 2 proposals per speaker. Topics include Experience Reports, Platform engineering, Tools. No char limits stated | Lightning 5-10 min; deep dive 20-40 min. No char limits stated |
| Rules | English only. Talks must be shareable ("redacted slides / can't say more" is a poor fit). No vendor ban stated. Login via Google, LinkedIn, Microsoft or classic account | Pure vendor talks not allowed; prefers new, fresh content; first-time speakers welcome; you must hold rights to all images and sound | Vendor-neutral; "talks must be about the problem rather than the product"; no sales or recruitment pitches; CNCF Code of Conduct |
| Speaker requirements | None beyond the above | None beyond the above | None; no prior speaking experience needed |

For the maintainer: none of the three mentions remote speaking. Programmable is the only one that explicitly considers travel and accommodation requests, and it closes in four days. Australia and Switzerland trips both need visas (timelines not verified here). Zurich and Melbourne state no support, so email the organisers before committing. Contacts on the pages: hello@banks.productions (Programmable), (organiser email on the Sessionize page) (Cloud Native Melbourne). Nothing has been sent.

---

## 1. Programmable 2027, Sydney (Cloud & Tools track, 40-minute session)

**Title:** Auto-approving Low-Risk AI-Reviewed PRs: a PR Risk Score from Git History, and What Happened When We Ran It

**Abstract (about 780 characters):**
AI agents now open and review pull requests faster than people can read them. One response is to give each PR a 0-1 risk score and blast radius from git history and the import graph, with no LLM in the loop, then auto-approve low-risk PRs that already passed an AI code review and send the rest to a person. This is an experience report on running that gate on one open-source repository: 54 PRs scored, 11 auto-approved, and a guard that stopped the tool approving changes to its own workflow. We also cover a public benchmark (ApacheJIT: AUC 0.823 against 0.821 for a regression on classic metrics) and where it falls short: noisy labels, a one-maintainer sample, and calibration that helped on some repositories and hurt on others.

**Takeaways:**
- How a git-history risk score and blast radius are built, and what they cannot see.
- What the gate did over 54 real PRs: 31 green, 21 yellow, 2 red, 11 approved, and why 14 green PRs were held by the self-modification guard.
- Why a score is a triage input, not a verdict: the benchmark result is "on par with a simple regression", not better.
- How to check a threshold on your own history before letting anything approve itself.
- Which policy checks (AI review passed, protected paths) matter as much as the score.

**Outline (40 min):**
- 0-5: The problem: AI-written and AI-reviewed PRs make human review the bottleneck.
- 5-12: What a risk score and blast radius are: signals from git history, import graph, size, tests, author experience; no LLM needed.
- 12-20: The policy layer: green below 0.3 plus a passed AI review; red and yellow go to a person.
- 20-30: Experience report on the tool's own repo (PRs #25-#90, 18 Oct to 17 Nov 2026): tier counts, the 11 approvals, the self-modification guard, the two red PRs that touched security-sensitive code.
- 30-35: Evidence and limits: ApacheJIT 0.823 vs 0.821; mixed calibration across repositories; labels mean "later needed a fix", not incidents.
- 35-40: Questions, and how to backtest on your own repo.

**Audience level:** Intermediate (comfortable with CI, pull requests and code review; no statistics background needed).

**Bio:** [BIO]

**Expenses:** request international travel and accommodation from abroad in the proposal, since the page says requests are considered with the proposal.

---

## 2. DevOpsDays Zurich 2027 (25 min + 5 Q&A; experience report, no vendor pitch)

**Title:** Experience Report: Letting a PR Risk Score Auto-Approve AI-Reviewed Changes, and Where It Said No

**Abstract (about 760 characters):**
When agents write and review most pull requests, human review becomes the slow step. This talk is a practitioner's experience report, not a product pitch, on one way to cut it: score each PR's risk and blast radius from git history (no LLM), auto-approve low-risk PRs that passed an AI code review, and route the rest to a person. Using the speaker's own open-source repository as the case, we look at 54 scored PRs, 11 auto-approvals, a guard that refused to approve changes to the gate itself, and two high-risk PRs that waited for a human. We add one public benchmark (ApacheJIT, AUC 0.823 vs 0.821 for a simple regression) and say plainly what this sample does not show: it is one maintainer, one month, no incident labels.

**Takeaways:**
- A concrete pattern for risk-based review routing that you can adapt with any tool, or none.
- What a gate that approves PRs needs around it: a passed AI review, protected paths, and a self-modification guard.
- How the gate behaved in practice: 54 PRs, 11 approved, 14 green PRs held by the guard.
- Why to backtest a threshold on your own history, since calibration helped on some repositories and hurt on others.
- Honest limits: a small single-maintainer sample shows gate behaviour, not bug prediction.

**Outline (25 min + 5 Q&A):**
- 0-3: The review bottleneck when agents write and review PRs.
- 3-8: The pattern: score, blast radius, policy, and who still reviews.
- 8-16: What happened on one repo: tiers, approvals, the guard, the two red PRs, what surprised the maintainer.
- 16-21: Evidence and limits: ApacheJIT 0.823 vs 0.821; noisy labels; mixed calibration; no incident data.
- 21-25: How to try the idea safely: comment-only first, backtest, then approval.
- 25-30: Q&A.

**Audience level:** Intermediate. Fits the topics "Experience Reports" and "Platform engineering". The CFP prefers fresh content; confirm the talk has not been given before.

**Bio:** [BIO]

Rule check: the abstract offers no pricing, feature tour or sales material, and the tool is the case study, not the subject. Max 2 proposals per speaker, so a 5-minute Ignite ("Why our PR gate refuses to approve itself") is possible but not drafted.

---

## 3. Cloud Native Melbourne (deep dive, 25 minutes; vendor-neutral)

**Title:** Blast Radius and Risk Score for PRs: What We Ran, What the Auto-Approve Gate Held Back, and What We'd Change

**Abstract (about 700 characters):**
A real implementation story about the problem, not a product tour. Reviews of AI-written, AI-reviewed pull requests pile up, so we put a risk gate in CI: a 0-1 PR risk score and blast radius computed from git history and the import graph, with no LLM, so low-risk PRs that passed AI code review can auto-approve. Over 54 PRs on one open-source repo, 11 were auto-approved, 14 more green PRs were held by a guard against self-modification, and two red PRs touched security-sensitive code. We share what surprised us, public benchmark results (ApacheJIT AUC 0.823 vs 0.821 for a regression), and the limits: a small sample, noisy labels, and calibration that sometimes hurt.

**Takeaways:**
- What ran, in which CI step, and what it needs (full git history, a merge queue, an AI review check).
- What the gate approved, held and escalated across 54 PRs.
- How to evaluate a gate like this on your own repository before trusting it.
- How a risk score compares with simpler options (smaller PRs, CODEOWNERS, rule-based auto-approve).
- What we would change: start comment-only, backtest first, keep a human on red.

**Outline (25 min):**
- 0-3: The problem and why a person cannot read every PR.
- 3-8: What was built and run in CI (signals, policy, merge queue).
- 8-15: What happened: the 54 PRs, the 11 approvals, the guard, the red PRs.
- 15-20: Evidence and limits: ApacheJIT 0.823 vs 0.821; mixed calibration; labels are "later needed a fix".
- 20-25: What we would do differently, alternatives, questions.

**Audience level:** Beginner to intermediate; platform engineers, SREs and engineering leads. A lightning cut (5-10 min: tier counts plus the guard) is possible.

**Bio:** [BIO]

Rule check: the CFP wants talks about the problem rather than the product and bans sales pitches; the tool is the case study only. Confirm in-person attendance and the actual date with the organiser, since the call is rolling and the page banner is contradictory.
