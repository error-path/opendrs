---
title: "Risk-tiered approval as change evidence: a PR risk score for standard changes and change control"
description: "How a per-PR risk score can support a risk-tiered change approval process (pre-authorised low-risk changes, a named human for the rest) in regulated teams, what FCA, GDS, DORA, APRA and ASD sources say about it, and what none of them say."
---

# Risk-tiered approval as change evidence

Last reviewed: 23 November 2026.

Regulated teams rarely ask whether a pull request was reviewed by AI. They ask whether a change was
recorded, assessed and approved by the right person for its risk. This page shows how the
[opendrs](./) risk score can sit in that process as a pre-merge risk tier, and what the public
sources do and do not say about it. It is not legal, audit or compliance advice.

## What the sources say, and what they do not

**No source below says that an automated approval counts as change evidence.** Treat every row as
context for your own policy, and ask your auditor or regulator contact before you rely on it.

| Source | What it says | Type |
|---|---|---|
| [FCA multi-firm review, Implementing technology change](https://fca.org.uk/publications/multi-firm-reviews/implementing-technology-change) | Change approval boards approved over 90% of major changes, and major changes failed about twice as often (3.8% vs 1.6%). Firms still relied on manual testing and peer review, and firms that deployed with automation had higher success rates. It is a 2021 document and says automation does not remove manual oversight. | Regulator |
| [GDS, AI coding assistants for developers in HMG](https://www.gov.uk/government/publications/ai-insights/ai-insights-ai-coding-assistants-for-developers-in-hmg-html) | Pairs human review with main-branch protection (updated Dec 2025). **It still expects a person to review merges**, so UK government teams cannot read it as permission to skip that. | Government guidance |
| DORA change management, as summarised by [Red Gate](https://www.red-gate.com/blog/why-digital-operational-resilience-act-dora-compliance-requires-auditable-database-change-management/) and [JFrog](https://jfrog.com/ja/blog/devgovops-enables-dora-compliance/) | ICT changes are recorded, assessed, approved and verified regardless of how they were produced, and the chain should trace to a named human. | Vendor commentary on the regulation, not regulator guidance |
| [Eurofi, March 2026](https://www.eurofi.net/wp-content/uploads/2026/03/cyber-and-digital-operational-resilience-eurofi-nicosia-march-2026.pdf) | Reports that "IT change" was the root cause of 38% of major bank incidents in 2025. | Industry think tank |
| [EU Product Liability Directive, as read by Heuking](https://www.heuking.de/de/news-events/newsletter-fachbeitraege/artikel/vibe-coding-rechtsfragen-und-haftungsrisiken-ki-erzeugter-software.html) | Directive 2024/2853 treats software and AI as products, Member States must transpose it by 9 December 2026, and AI-generated code does not reduce liability for defects. | Law-firm commentary |
| [EU Futurium post, human approval is not human oversight](https://futurium.ec.europa.eu/sk/apply-ai-alliance/community-content/human-oversight-not-same-human-approval) | Argues that a recorded approval does not prove effective oversight, and that rubber-stamping is the failure mode. [AI Act Article 14](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14) concerns high-risk AI systems, not coding tools. | Opinion post |
| [APRA letter to industry on AI, 30 April 2026](https://apra.gov.au/news-and-publications/apra-letter-industry-artificial-intelligence-ai) | Says AI-assisted development "is straining change and release management controls", that traditional change management is "not sufficient", and expects human involvement for high-risk decisions. | Regulator |
| [Clayton Utz on the APRA letter](https://www.claytonutz.com/insights/2026/may/apras-ai-letter-a-shift-from-framework-to-targeted-expectations) | Says point-in-time sampling fails for AI and recommends continuous validation. | Law-firm commentary |
| [ISM, September 2026, guidelines for software development](https://cyber.gov.au/ism/2026-09/guidelines-for-software-development) | Covers AI-assisted, AI-powered and AI-driven software development, and asks for changes tied to issue-tracker decisions, documented security design decisions, and SAST, DAST and SCA on artefacts. | Government guidance |

Three limits to keep in view:

- **Automated approval is not endorsed anywhere above.** APRA and ASD text does not say it is
  acceptable evidence, and the research behind this page found no source that maps APRA's CPS 230
  or CPS 234 to PR approval.
- **GDS still expects human review of merges.** In a UK government team, the low-risk path has to
  mean a lighter review, not no person.
- **Most EU material is commentary.** The DORA and Product Liability rows come from law firms and
  vendors, not regulators, and other sources dispute personal liability for managers.

## The idea: pre-authorised low-risk changes, a named human for the rest

Two practitioner write-ups
([one](https://dev.to/beefedai/moving-from-cab-to-automated-guardrails-and-itsm-integration-fao),
[two](https://www.securityscientist.net/blog/12-questions-and-answers-about-change-approval-automation-in-high-velocity-teams/);
both blog or vendor sources) propose risk-tiered approval in ITIL terms: pre-authorised standard
changes for low risk, normal changes with an expert approver for the rest. A per-PR risk score is
one way to decide which path a pull request takes.

opendrs is not a code reviewer. It does not read your code for defects. It computes a 0-1 risk score
from change signals and routes the pull request. [Policy and safety rails](policy.md) lists the
rules.

| Change-control need | What opendrs can provide | What stays with you |
|---|---|---|
| Decide which path a change takes | A score, a `risk:green`, `risk:yellow` or `risk:red` label and a decision on each PR | Writing down which tier maps to which path in your change policy |
| Pre-authorise a class of low-risk change | Auto-approval only for green PRs by default, and never for CI, lockfile, migration, infrastructure or self-config changes | Having the policy and its owner approved by whoever your framework requires |
| Send risky changes to a person | Yellow and red PRs go to human review, with suggested reviewers | Naming the accountable approver and enforcing the review in branch protection |
| Keep the evidence | A PR comment with the score and top signals, an approval review with a marker, labels and workflow outputs | Exporting and retaining them for your audit period |
| Show people still read a share of approvals | `sampleRate` (default 0.1) sends a share of would-be approvals to a person | Reviewing the sample and the exported list on a schedule |

The score is deterministic, so the same inputs give the same score and the signals that moved it are
listed. That can support a reviewer who asks why a change was treated as low risk. It does not show
that the scoring policy itself is right for your controls.

## What it can and cannot support

opendrs can provide evidence for a risk-tiered change process: a recorded, reproducible tier per
pull request, and a record of what the gate did. It supports change control. It does not make a team
compliant with DORA, APRA CPS 230 or CPS 234, the ISM, the FCA's expectations or any other
framework.

On ranking quality, the figures to quote are in [Benchmark results](results.md): on the ApacheJIT
benchmark, calibrated opendrs reaches AUC 0.823 and catches 67% of buggy commits in its riskiest
30%. A score that ranks well says nothing certain about any single change, which is why the
high-risk path keeps a person.

## A starting point for your policy

1. Write down which paths and change sizes may be approved without a person, and who owns that rule.
2. Keep the gate on green PRs only, and keep `sampleRate` above zero.
3. Require a named human for yellow and red, and enforce it with branch protection.
4. Export the approvals on a schedule and have someone read them. See
   [Audit what the gate approved](auto-approve.md#audit-what-the-gate-approved).
5. Check with your auditor that this satisfies your written control before you rely on it.

An approval only counts toward a required review if GitHub counts it. See
[Why a bot approval does not count as a required review](bot-approval-required-reviews.md).

## Related

- [What auto-approval leaves for auditors](auto-approval-audit-evidence.md): the record opendrs leaves per PR and how to export it
- [Auto-approve low-risk pull requests](auto-approve.md)
- [Is AI reviewing AI just the author reviewing their own PR?](ai-reviewing-ai.md)
- [Reduce the code review bottleneck for AI-generated pull requests](ai-pr-review-bottleneck.md)
- [Limitations](limitations.md)
