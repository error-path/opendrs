#!/usr/bin/env node
// Checks every internal link and anchor in the repo's Markdown docs offline, without a Jekyll
// build: a relative link's target file must exist, and a `#fragment` must match a heading in that
// file (or in the current file, for a same-page link). This is the GitHub-side half of
// scripts/check-site.mjs, which only checks the already-built Pages site; this one catches a link
// to a path that never exists on disk at all — e.g. a doc linking to a sibling page as `.html`,
// which 404s on github.com (`.html` only exists in the Pages build, via jekyll-relative-links).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Files and directories this check covers; kept in sync with the repo's user-facing docs.
export const TARGETS = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs",
  "skills",
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "_site" || entry.name === "vendor") return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function listDocFiles(root) {
  return TARGETS.flatMap((target) => {
    const path = join(root, target);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) return [];
    const files = stat.isDirectory() ? walk(path) : [path];
    return files.filter((f) => f.endsWith(".md"));
  });
}

// GitHub's heading-to-anchor algorithm: lowercase, drop inline formatting and links, strip
// punctuation, spaces to hyphens, de-duplicate with a `-2`, `-3`, ... suffix.
export function slugify(heading) {
  return heading
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function headingSlugs(markdown) {
  const slugs = new Set();
  const counts = new Map();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!heading) continue;
    let slug = slugify(heading[1]);
    const seen = counts.get(slug) ?? 0;
    counts.set(slug, seen + 1);
    if (seen > 0) slug = `${slug}-${seen}`;
    slugs.add(slug);
  }
  return slugs;
}

// Markdown links/images outside fenced code blocks and inline code spans, as `{ line, url }`
// (1-indexed line numbers). Inline code is blanked out first so a backtick-quoted regex or path
// like `["']([A-Za-z_]\w*)["']` can't be misread as `[link text](url)`.
export function findLinks(markdown) {
  const links = [];
  let inFence = false;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const withoutCodeSpans = line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
    for (const m of withoutCodeSpans.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      links.push({ line: i + 1, url: m[1].trim().split(/\s+["']/)[0] });
    }
  }
  return links;
}

function isExternal(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

// `{{ ... }}` is a Liquid expression (e.g. a collection loop's computed URL): not a static path
// this check can resolve, and valid Jekyll outside this check's scope.
function isTemplated(url) {
  return url.includes("{{");
}

export function checkFile(file, slugCache) {
  const problems = [];
  const markdown = readFileSync(file, "utf8");
  const ownSlugs = () => {
    if (!slugCache.has(file)) slugCache.set(file, headingSlugs(markdown));
    return slugCache.get(file);
  };
  for (const { line, url } of findLinks(markdown)) {
    if (!url || isExternal(url) || isTemplated(url)) continue;
    const [pathPart, fragment] = url.split("#");
    let targetFile = file;
    if (pathPart) {
      targetFile = resolve(dirname(file), decodeURIComponent(pathPart));
      const stat = statSync(targetFile, { throwIfNoEntry: false });
      if (!stat) {
        problems.push(`${file}:${line}: ${url} -> missing ${relative(process.cwd(), targetFile)}`);
        continue;
      }
      if (stat.isDirectory()) targetFile = join(targetFile, "index.md");
    }
    if (fragment === undefined) continue;
    if (!slugCache.has(targetFile)) {
      const stat = statSync(targetFile, { throwIfNoEntry: false });
      slugCache.set(targetFile, stat ? headingSlugs(readFileSync(targetFile, "utf8")) : null);
    }
    const slugs = targetFile === file ? ownSlugs() : slugCache.get(targetFile);
    if (slugs && !slugs.has(fragment)) {
      problems.push(`${file}:${line}: ${url} -> no heading "${fragment}" in ${relative(process.cwd(), targetFile)}`);
    }
  }
  return problems;
}

export function checkAll(root) {
  const slugCache = new Map();
  return listDocFiles(root).flatMap((file) => checkFile(file, slugCache));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ?? resolve(new URL(".", import.meta.url).pathname, "..");
  const problems = checkAll(root);
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `md link check: ${problems.length} problem(s)` : "md link check passed");
  process.exit(problems.length ? 1 : 0);
}
