---
title: "Review pull requests where a coding agent adds a dependency"
description: "Why a dependency added by a coding agent needs a person: invented or mistyped package names and install scripts. What opendrs does with manifest and lockfile changes (never auto-approves them by default), what it does not check, and a short checklist for reviewers."
---

# Review pull requests where a coding agent adds a dependency

A coding agent that needs a library often adds it on its own: one line in `package.json`,
`requirements.txt` or `go.mod`, and a lockfile change. That line is easy to skim past. This page
says what can go wrong, what [opendrs](./) does with such a PR, and what it leaves to you.

## The risk

- **Invented package names.** Code-generating models suggest packages that do not exist. One
  study measured an average rate of at least 5.2% for commercial models and 21.7% for open-source
  models, and collected 205,474 unique invented names
  ([Spracklen et al., "We Have a Package for You!"](https://arxiv.org/abs/2406.10279)). Anyone can
  publish a package under such a name, so the next install may fetch their code.
- **Mistyped names.** A name one letter off a popular package can be a different package, by a
  different author.
- **Install scripts.** Many package managers run code from the package, or from the manifest, when
  it is installed or built. That code runs on your CI runner and on every developer machine.
- **Large lockfile diffs.** A one-line manifest change can pull in many transitive packages. Few
  people read the lockfile diff.

## What opendrs does

opendrs never approves a PR that changes a package manifest, by default:

- The default `paths.block` list includes the manifests and build files that can run code on
  install, build or CI: `**/package.json`, `**/.npmrc`, `**/setup.py`, `**/pyproject.toml`,
  `**/requirements*.txt`, `**/go.mod`, `**/Cargo.toml`, `**/Gemfile`, `**/pom.xml`,
  `**/build.gradle`, `**/*.csproj` and more. A changed file that matches it sends the PR to
  `human-review` (rule 1 in [Decision rules](policy.md#decision-rules)). The full list is
  `DEFAULT_BLOCK` in [`src/domain/config.ts`](https://github.com/error-path/opendrs/blob/main/src/domain/config.ts).
- Lockfiles are in the default `paths.ignore` list (`**/*.lock`, `**/package-lock.json`,
  `**/pnpm-lock.yaml`, `**/go.sum`). Ignored files are not scored, but a PR that changes one still
  goes to `human-review` (rule 2). So a lockfile-only change is not approved either.
- Your own `paths.block` adds to the defaults. Only `paths.unblock` removes a default entry, and it
  must name that entry exactly. See [Configuration](configuration.md).

These rules apply to every author: a person, a bot or an AI agent.

## What opendrs does not do

opendrs reads paths and the diff. It does not look up packages:

- It does not check that a package exists, who publishes it, how old it is, or how many people use
  it.
- It does not detect typosquatting or malicious packages.
- It does not check for known vulnerabilities or licenses.

A `human-review` decision only means a person must look. Use other tools for the package itself:

- **GitHub dependency review** shows on a PR which dependencies were added, removed or updated,
  with release dates, vulnerability and license data. The `dependency-review-action` can fail the
  check when a PR adds a vulnerable version
  ([GitHub](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review)).
  GitHub's page does not say it detects invented or typosquatted names.
- **npm provenance** lets anyone see where a package was built and who published it.
  `npm audit signatures` checks the registry signatures and provenance attestations of installed
  packages ([npm](https://docs.npmjs.com/generating-provenance-statements)).

## Checklist for reviewers

When an agent's PR adds or changes a dependency:

1. **Did the task need it?** Ask whether the standard library or a dependency you already have
   does the job.
2. **Is the name right?** Open the package's registry page from the name in the diff, not from a
   search. Check the spelling against the project's own repository link.
3. **Is it real and maintained?** Look at the publisher, the first release date, recent releases,
   and the source repository.
4. **Does it run code on install?** Check the package for install scripts (for npm, `preinstall`,
   `install` and `postinstall` in its `package.json`).
5. **Is the version pinned, and does the lockfile match?** Read the lockfile diff for packages you
   did not expect.
6. **Did the checks run?** Dependency review, vulnerability alerts, and `npm audit signatures` or
   your ecosystem's equivalent.

## Related

- [Policy and safety rails](policy.md): every rule that sends a PR to a person.
- [Auto-approve low-risk pull requests](auto-approve.md): set up the gate.
- [Limitations](limitations.md): what opendrs does not catch.
