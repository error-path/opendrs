# Docs site: long-term search visibility (Actions build, accurate lastmod, IndexNow, structure)

Status: **design approved section by section on 2026-10-21. The written spec awaits review.**
It follows the crawlability audit in `docs/research/2026-10-21-seo-crawlability.md`. That audit
fixed the site's defects (PR #44) and added a first IndexNow workflow. This spec covers the
long-term setup.

## 1. Goal and constraints

**Goal.** People and coding agents searching for "PR blast radius", "pull request risk score" or
"auto-approve pull requests" find opendrs on Google, Bing and Copilot. The site should stay
findable as the docs grow, with no manual upkeep.

**Constraints (from the user).**
- Choose the long-term option over the cheap fix.
- No money: no paid domain and no paid service.
- Keep the existing theme.
- The user pushes and uses the search consoles. Claude never does.
- The user is not an SEO expert and delegated the technical choices.

**Success criteria.**
- Every published page has an accurate `<lastmod>`.
- Bing is told about every added, changed and removed page without anyone acting.
- No page can be found only through the sitemap.
- Content follows Bing guidelines §11–18 and Google's Who/How/Why guidance.
- Build-time checks enforce all of this, so it cannot regress unnoticed.

## 2. What the guidelines require, and the gaps

Sources were read on 2026-10-21 and are listed in Appendix B.

| Requirement | Source | Gap on the live site |
|---|---|---|
| Sitemaps carry freshness signals (`lastmod`), list only canonical URLs and drop removed URLs promptly | Bing §3. Google uses `lastmod` "if it's consistently and verifiably accurate" | No `<lastmod>`. The legacy Pages build cannot compute it |
| Notify IndexNow when URLs are added, updated **or removed**, streaming rather than in batches | Bing §4, §9, §19 | `indexnow.yml` submits only added and changed pages that are still in the sitemap. Removals are never sent |
| Every important URL reachable through crawlable internal links | Bing §5. Google: "every page you care about should have a link from at least one other page" | `research/2026-10-20-code-review-at-anthropic.html` and `maintaining.html` have no inbound link |
| Define entities clearly. Align the title, H1 and content | Bing §16, §17 | The homepage H1 ("A 0–1 risk score for every pull request") never names opendrs |
| Content stands on its own, with key information near the top | Bing §11, §15, §18 | Research notes open with process notes. The field-test note cites local `~/.cache/...` paths |
| Who, How and Why: visible authorship and dates, and disclosure of automation where readers would wonder | Google, "Creating helpful content" | No bylines or dates. The heavy AI assistance (343 of 409 commits are co-authored by Claude) is not stated on the site |
| Structured data must match the visible content | Bing §14. Google AI-features guide | Met. The FAQ block mirrors the visible FAQ |
| No special files are needed for AI Overviews | Google AI-features guide | `llms.txt` is harmless. Keep it and put no further work into it |

**Facts that rule options out.**
- Google removed FAQ rich results in June 2026.
- SoftwareApplication rich results require real ratings or reviews. Inventing them is spam.
- Google does not support site names for subdirectory sites such as `github.io/opendrs/`.
- Google sets no length limit on meta descriptions.

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| Hosting | **Stay on `error-path.github.io/opendrs/`** | Chosen by the user over a free `opendrs.js.org` subdomain. URLs never change (Bing §20) and the site depends on no third party. The cost is that Google cannot show a site name for a subdirectory site. Revisit only if the project ever gets a domain |
| Build | **GitHub Actions build with Jekyll 4.4.** The legacy Pages build is retired | The legacy builder is frozen on Jekyll 3.10 and blocks plugins outside its allowlist, including the one that computes `lastmod`. The Actions build is GitHub's recommended path and free for public repos |
| `lastmod` source | **`jekyll-last-modified-at`** (git commit date of the page's source file) | Accurate and verifiable. Layout and CSS commits do not move it, which matches Google's "significant update" rule. Hand-kept dates were rejected: they go stale (short-term fix) |
| IndexNow trigger | **Sitemap diff inside the deploy workflow** | Exact added, changed and removed URLs with no file-to-URL mapping. A layout-only deploy submits nothing |
| Site checks | **Zero-dependency Node script** (`scripts/check-site.mjs`) | The repo is Node-first and the checks are specific to this site. html-proofer would add native Ruby dependencies for a narrower job |
| Disclosure | **Short About page, plus bylines and dates on research notes** | Chosen by the user. The wording is in §4.3 |

## 4. Design

### 4.1 Build and deploy

**New `docs/Gemfile` and `docs/Gemfile.lock`.** Pin `jekyll ~> 4.4`. In the `:jekyll_plugins`
group, add exactly what the site uses:
- `jekyll-seo-tag`
- `jekyll-sitemap`
- `jekyll-relative-links`, which rewrites `.md` links to `.html`
- `jekyll-last-modified-at`

`jekyll-optional-front-matter` and `jekyll-titles-from-headings` are not needed. Every published
page has front matter and a title, and the homepage title comes from `site.title`.
`docs/_config.yml` keeps its `plugins:` list in step with the Gemfile.

**New `.github/workflows/pages.yml`, replacing `.github/workflows/indexnow.yml`.**
- Triggers: `push` to `main` with paths `docs/**`, `scripts/check-site*.mjs` and the workflow
  file; `pull_request` with the same paths; `workflow_dispatch` with one optional input, `extra_urls` (see 4.2).
- `permissions: contents: read` at the top. The deploy job adds `pages: write` and `id-token: write`.
- `concurrency`:
  - Push and dispatch runs use group `pages` with `cancel-in-progress: false`. A deploy is never
    cut off half-way, and a newer queued run replaces an older queued one.
  - PR runs use a per-PR group with `cancel-in-progress: true`.
- **Job `build`, which runs for every trigger:**
  1. `actions/checkout` with `fetch-depth: 0`, because `lastmod` needs the full history.
  2. `ruby/setup-ruby` with `working-directory: docs` and `bundler-cache: true`.
  3. `actions/configure-pages`, but not on PRs.
  4. `bundle exec jekyll build` in `docs/` into `docs/_site`, with `JEKYLL_ENV=production`.
  5. `node scripts/check-site.mjs docs/_site`. A failure stops the run, so a broken site never
     deploys.
  6. Except on PRs, compute the IndexNow URL list (4.2) with `scripts/indexnow-urls.mjs` and
     expose it as a job output.
  7. Except on PRs, run `actions/upload-pages-artifact` on `docs/_site`.
- **Job `deploy`, which needs `build` and skips PRs.** `actions/deploy-pages` with environment
  `github-pages`.
- **Job `indexnow`, which needs `deploy` and skips PRs.** It POSTs the list (4.2).
- All actions are pinned by commit SHA with a version comment, matching `ci.yml`. Current
  releases are `configure-pages` v6.0.0, `upload-pages-artifact` v5.0.0, `deploy-pages` v5.0.1 and
  `ruby/setup-ruby` v1.331.0. The Ruby version (3.4) is pinned in `docs/.ruby-version`.
- **Dependabot:** add a `bundler` entry for `/docs` to `.github/dependabot.yml` on the existing
  weekly schedule.
- `docs/_site/` and `docs/.jekyll-cache/` go in `.gitignore`.

**Parity.** The move to Jekyll 4.4 must not change what readers see. Before the switch, build the
branch with the content changes (4.3) held back. Diff every HTML page against the live site,
which is the legacy builder's output. Allowed differences:
- the `generator` meta
- the new `lastmod`, `dateModified` and `datePublished` fields
- whitespace
- changes caused by jekyll-seo-tag 2.8.0 → 2.9.x, each reviewed and listed in the PR

Anything else is fixed before the switch.

### 4.2 Freshness and IndexNow

- **`lastmod`.** The plugin sets `page.last_modified_at` from the latest commit that touched the
  page's source file. jekyll-sitemap writes it as `<lastmod>`, and jekyll-seo-tag writes it as
  `dateModified`. Research notes also get `date:` in front matter, which jekyll-seo-tag writes as
  `datePublished`. Pages with a `date` become `BlogPosting` in jekyll-seo-tag's JSON-LD, which is
  correct for dated notes.
- **URL list (job `build`, after the site check).**
  1. Fetch the live `sitemap.xml` with a cache-busting query.
  2. Parse `(loc, lastmod)` pairs from it and from `docs/_site/sitemap.xml`.
  3. Classify each URL:
     - **added**: in the new sitemap, not in the old one
     - **changed**: in both, with a different `lastmod`
     - **removed**: in the old sitemap, not in the new one
  4. Add the `extra_urls` input from manual runs. Each one must start with
     `https://error-path.github.io/opendrs/`; anything else fails the run.
  5. Deduplicate.

  The live sitemap has no `lastmod` today, so the first deploy after the switch submits every page
  once. That is expected.
- **Submit (job `indexnow`).**
  - An empty list is logged as "No published pages changed." in the build job, and the
    `indexnow` job is skipped.
  - Otherwise, POST `{host, key, keyLocation, urlList}` to `https://api.indexnow.org/indexnow`.
    It uses the same key and key file as today (`docs/7761d20ca5295159e2dd2f14ffccbe2b.txt`), so
    nothing changes in Bing.
  - HTTP 200 or 202 passes. Anything else fails the job visibly. The deploy has already
    succeeded, so the site is never held back by IndexNow.
- **One-time backfill.** The first manual run passes the six plan URLs removed in PR #44 as
  `extra_urls` (listed in §6).

### 4.3 Structure and content

**New pages.**
- **`docs/research/index.md`** (`/research/`, title "Research notes"). The list is built in Liquid
  from `site.pages`: pages in `/research/` that have a `date` and are not `sitemap: false`, newest
  first. Each entry shows the title, linked, then the date and the description. Add "Research" to
  `nav.more` in `_config.yml`.
- **`docs/about.md`** (`/about.html`, title "About these docs"), linked from the footer. Text:

  > opendrs is maintained by error-path and released under the MIT license. The code, these docs
  > and the research notes are written with AI assistance (Claude) and reviewed by the maintainer
  > before they are merged. Every benchmark number on this site comes from a script in the
  > repository, and [Results](../results.md) shows how to reproduce each one. Corrections are
  > welcome as [GitHub issues](https://github.com/error-path/opendrs/issues).

  `/about.html` does not match jekyll-seo-tag's homepage-or-about pattern (`/about/`), so it gets
  ordinary `WebPage` markup.
- **`docs/404.html`** (`permalink: /404.html`, `sitemap: false`, title "Page not found").
  - It uses the default layout and says "This page doesn't exist or has moved", with links to the
    homepage, "Auto-approve PRs", "GitHub Action" and "CLI & MCP".
  - GitHub Pages serves it with status 404 for missing paths under `/opendrs/`.
  - jekyll-sitemap already leaves `/404.html` out.

**Changes to existing files.**
- **Homepage H1** in `docs/index.html` becomes "opendrs: a 0–1 risk score for every pull
  request". The hero copy is otherwise unchanged.
- **Layout (`docs/_layouts/default.html`).**
  - On pages with a `date`, render an eyebrow line above the content: "Research note · By
    error-path · Published 18 Oct 2026".
  - On every non-home page, the closing line becomes "Updated 21 Oct 2026 · Edit this page on
    GitHub", using `page.last_modified_at`.
  - The footer gains About, Research and Maintaining links. This gives `maintaining.html` its
    inbound link.
- **Research notes (the three with a sitemap entry):**
  - Add `date:` (2026-10-18, 2026-10-19, 2026-10-20).
  - Replace each opening "Research note, <date>." line with two or three sentences stating the key
    findings.
  - In the field-test note, rewrite the intro without local paths. It becomes "based on notes from
    six field-test sessions".
  - Leave the body text alone.
- **The 2026-10-21 SEO audit note** stays `sitemap: false` and unlisted. It is an internal
  maintenance record, and the check in 4.4 covers only sitemap pages.
- **`docs/llms.txt`:** add the Research and About entries.
- **`docs/maintaining.md`:** add a "Docs site" section covering:
  - the Pages workflow, and that it needs no secrets
  - how to read a failed site check
  - IndexNow and the `extra_urls` input
  - what to do if the Bing key is ever rotated: replace the key file and the `KEY` value in
    `pages.yml`

**Deliberately not done:** ratings markup, new FAQ markup, trimming descriptions to 160
characters, changing the URL scheme (the `.html` URLs stay), and more work on `llms.txt`.

### 4.4 Guardrails: `scripts/check-site.mjs`

The script is plain Node 22 ESM with no dependencies. It takes the built site directory and the
site prefix (default `https://error-path.github.io/opendrs/`). It prints every violation as
`file: rule: detail` and exits 1 if there are any.

| Rule | Check |
|---|---|
| `link` | Every `href` and `src` that points inside the site (relative, `/opendrs/…`, or absolute with the prefix) resolves to a built file. A `#fragment` resolves to an `id` in the target page |
| `sitemap` | Every `<loc>` resolves to a built file and has a `<lastmod>`. No `<loc>` sits under `superpowers/` or `specs/` |
| `title` | Each sitemap page has exactly one `<title>`, unique across the sitemap |
| `description` | Each sitemap page has a non-empty meta description, unique across the sitemap |
| `h1` | Each sitemap page has exactly one `<h1>` |
| `canonical` | Each sitemap page's canonical URL equals its `<loc>` |
| `noindex` | No sitemap page has a `robots` meta containing `noindex` |
| `orphan` | Each sitemap page other than the homepage is linked from at least one other built page, nav included |
| `jsonld` | Every `application/ld+json` block parses as JSON |
| `llms` | Every site URL in `llms.txt` resolves to a built file |

It parses HTML with targeted regular expressions over Jekyll's known output, which needs no
dependency. Sitemap parsing is shared with `indexnow-urls.mjs` through `scripts/sitemap.mjs`. Every rule is covered by a fixture test in `scripts/check-site.test.mjs` and
`scripts/indexnow-urls.test.mjs`, run with
`node --test`. The test proves each rule catches a seeded violation and passes a clean fixture.
That test runs in the `build` job before the check. It is not part of the npm suite.

## 5. Verification (during implementation)

1. **Parity diff** as described in 4.1, run locally with Homebrew Ruby (`brew install ruby`;
   system Ruby 2.6 is too old for Jekyll 4.4).
2. **The check script works.** Run it on a build of today's `main` content. It must flag the two
   orphan pages (`research/2026-10-20-code-review-at-anthropic.html`, `maintaining.html`) and the
   missing `lastmod`s, which proves it detects real problems. Then it must pass on the finished
   branch.
3. **IndexNow dry run.** Run the URL-list step locally against the live sitemap and the branch
   build, then inspect the JSON payload. Nothing is sent.
4. **Workflow sanity.** Parse the YAML. Shell-check the inline scripts with `bash -n`. Confirm
   that every job condition (`if:`) keeps PR runs away from deploy and IndexNow.

The repo's npm test suite is not touched.

## 6. Rollout (user steps)

1. Push the branch and open the PR. The `pages / build` job runs on the PR. Check that it is
   green.
2. Right before merging: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
   This stops the legacy build. The site keeps serving its last build until the new deploy
   finishes.
3. Merge. In Actions, check that the **pages** workflow is green and the site looks unchanged.
4. Actions → **pages** → **Run workflow** with `extra_urls` set to these six URLs on one line,
   separated by spaces (the field is single-line):
   ```
   https://error-path.github.io/opendrs/superpowers/plans/2026-10-16-apachejit-bench.html
   https://error-path.github.io/opendrs/superpowers/plans/2026-10-18-review-brief.html
   https://error-path.github.io/opendrs/superpowers/plans/2026-10-19-captain-brief.html
   https://error-path.github.io/opendrs/superpowers/plans/2026-10-19-module-boundaries.html
   https://error-path.github.io/opendrs/superpowers/plans/2026-10-20-inert-changes.html
   https://error-path.github.io/opendrs/superpowers/plans/2026-10-20-pre-pr-self-check.html
   ```
5. Optional and free: create the root user site from Appendix A.
6. Use Request indexing once for the homepage in Bing (URL Inspection) and Google (URL
   inspection). Everything after that is automatic.

**Rollback.** Revert the PR, which removes `docs/Gemfile` and `docs/.ruby-version` and restores
`indexnow.yml`. Then set the Pages source back to "Deploy from a branch" (`main`, `/docs`). The
site returns to exactly the pre-switch setup.

## 7. Measuring success

| When | Signal | Where to read it |
|---|---|---|
| Within about 2 weeks of the switch | The homepage shows as crawled | Bing Webmaster Tools → URL Inspection |
| Every deploy | IndexNow HTTP 200 or 202, and the submitted URLs are listed | Actions → pages → `indexnow` job log; Bing → IndexNow |
| 4–8 weeks | About 20 pages indexed, and no "Discovered – not crawled" entries | Bing → Site Explorer; Google Search Console → Indexing → Pages |
| Ongoing | Impressions for "blast radius" and "auto-approve" queries | Bing → Search Performance; Google → Performance |

## 8. Out of scope

- Custom domain or js.org (declined).
- Off-site promotion: awesome lists, Show HN or dev.to, MCP directories, the repo's social
  preview. These stay on the user's open list in the project memory.
- Trimming description lengths.
- Page-speed work on Google Fonts.

## Appendix A: optional root user site (`error-path/error-path.github.io`)

Create a public repo with exactly that name and enable Pages (deploy from `main`, `/`). It needs
two files.

`robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://error-path.github.io/opendrs/sitemap.xml
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>error-path</title>
  <meta name="description" content="Open-source developer tools by error-path, including opendrs, a PR blast radius analyzer and risk score.">
  <link rel="canonical" href="https://error-path.github.io/">
</head>
<body>
  <h1>error-path</h1>
  <p>Open-source developer tools.</p>
  <ul>
    <li><a href="https://error-path.github.io/opendrs/">opendrs</a>: a 0–1 risk score for every pull request, so low-risk, AI-reviewed PRs can be auto-approved.</li>
  </ul>
  <p><a href="https://github.com/error-path">GitHub</a></p>
</body>
</html>
```

These give the host a real homepage in place of a 404, a host-root `robots.txt` that points to the
sitemap, and a link from the host root into the project.

## Appendix B: sources (read 2026-10-21)

- Bing Webmaster Guidelines — https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
- Google SEO Starter Guide — https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google Search Essentials — https://developers.google.com/search/docs/essentials
- Build and submit a sitemap — https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Title links — https://developers.google.com/search/docs/appearance/title-link
- Snippets and meta descriptions — https://developers.google.com/search/docs/appearance/snippet
- Site names — https://developers.google.com/search/docs/appearance/site-names
- FAQPage (removed) — https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Software app — https://developers.google.com/search/docs/appearance/structured-data/software-app
- Consolidate duplicate URLs — https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- AI features and your website — https://developers.google.com/search/docs/appearance/ai-features
- Creating helpful content — https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Link best practices — https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- Get on Google — https://developers.google.com/search/docs/fundamentals/get-on-google
