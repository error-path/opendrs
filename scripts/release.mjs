#!/usr/bin/env node
// Release edits, run by the maintainer (`npm run release:prepare -- 0.7.0`) and by the
// "Finish a release" workflow (`node scripts/release.mjs pin-plugin 0.7.0`). See
// docs/maintaining.md, "Releasing".
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** A release version such as `1.2.3` or `1.2.3-rc.1`, the release tag's pattern without the `v`. */
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

/** Files that pin the npm package for plugin installs. */
const PLUGIN_FILES = ["plugin/.claude-plugin/plugin.json", "plugin/commands/opendrs-review.md", "plugin/skills/opendrs/SKILL.md"];

/**
 * Throws unless `version` is a release version.
 *
 * @param version - The value to check.
 * @throws {@link Error} If it is not like `1.2.3` or `1.2.3-rc.1`.
 */
function assertVersion(version) {
  if (!VERSION_PATTERN.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);
}

/**
 * Replaces the first `count` occurrences of `search` in `text`.
 *
 * @param text - The text to change.
 * @param search - The exact text to find.
 * @param replacement - The text to put in its place.
 * @param count - How many occurrences to replace.
 * @returns The changed text.
 * @throws {@link Error} If `text` has fewer than `count` occurrences.
 */
function replaceFirst(text, search, replacement, count) {
  let result = text;
  let searchFrom = 0;
  for (let occurrence = 0; occurrence < count; occurrence++) {
    const index = result.indexOf(search, searchFrom);
    if (index < 0) throw new Error(`expected ${count} of ${search}, found ${occurrence}`);
    result = result.slice(0, index) + replacement + result.slice(index + search.length);
    searchFrom = index + replacement.length;
  }
  return result;
}

/**
 * Writes each changed file, after every edit was computed, so a failed edit changes nothing.
 *
 * @param rootDir - The repository root.
 * @param edits - Each file's path relative to the root, mapped to a function from its text to the new text.
 * @returns The paths whose text changed.
 */
function applyEdits(rootDir, edits) {
  const changed = [];
  for (const [relativePath, edit] of Object.entries(edits)) {
    const before = readFileSync(join(rootDir, relativePath), "utf8");
    const after = edit(before);
    if (after !== before) changed.push([relativePath, after]);
  }
  for (const [relativePath, text] of changed) writeFileSync(join(rootDir, relativePath), text);
  return changed.map(([relativePath]) => relativePath);
}

/**
 * Sets the package's version everywhere it is written down, and dates the changelog's Unreleased
 * section. The plugin pins are left alone: they move only after npm has the version.
 *
 * @param rootDir - The repository root.
 * @param newVersion - The version to release, such as `0.7.0`.
 * @param releaseDate - The changelog date, as `YYYY-MM-DD`.
 * @returns The changed files, relative to the root.
 * @throws {@link Error} If the version is invalid or unchanged, or the changelog has no `## Unreleased` heading.
 */
export function bumpVersion(rootDir, newVersion, releaseDate) {
  assertVersion(newVersion);
  const oldVersion = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).version;
  if (oldVersion === newVersion) throw new Error(`package.json already has version ${newVersion}`);
  const oldField = `"version": "${oldVersion}"`;
  const newField = `"version": "${newVersion}"`;
  return applyEdits(rootDir, {
    "package.json": (text) => replaceFirst(text, oldField, newField, 1),
    // The first two are the package's own entries; a dependency may share the old version.
    "package-lock.json": (text) => replaceFirst(text, oldField, newField, 2),
    "src/version.ts": (text) => replaceFirst(text, `"${oldVersion}"`, `"${newVersion}"`, 1),
    "server.json": (text) => replaceFirst(text, oldField, newField, 2),
    // The golden test compares the whole scoring result, which records the version.
    "tests/fixtures/golden-full-score.json": (text) => replaceFirst(text, oldField, newField, 1),
    "CHANGELOG.md": (text) => {
      if (!/^## Unreleased\r?$/m.test(text)) throw new Error("CHANGELOG.md has no '## Unreleased' section to release");
      return text.replace(/^## Unreleased(?=\r?$)/m, `## ${newVersion} - ${releaseDate}`);
    },
  });
}

/**
 * Pins the Claude Code plugin to a released npm version: the manifest version and every
 * `@error-path/opendrs@<version>` call.
 *
 * @param rootDir - The repository root.
 * @param version - The version npm already serves.
 * @returns The changed files, relative to the root; empty when the plugin already pins it.
 * @throws {@link Error} If `version` is not a release version.
 */
export function pinPlugin(rootDir, version) {
  assertVersion(version);
  const pinVersion = (text) => text.replace(/@error-path\/opendrs@[0-9A-Za-z.-]+/g, `@error-path/opendrs@${version}`);
  return applyEdits(
    rootDir,
    Object.fromEntries(
      PLUGIN_FILES.map((relativePath) => [
        relativePath,
        relativePath.endsWith("plugin.json") ? (text) => pinVersion(text).replace(/"version": "[^"]*"/, `"version": "${version}"`) : pinVersion,
      ]),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, version] = process.argv.slice(2);
  try {
    if (command === "prepare") {
      const changed = bumpVersion(process.cwd(), version ?? "", new Date().toISOString().slice(0, 10));
      console.log(`Set version ${version} in:\n  ${changed.join("\n  ")}`);
      // One fixed string through the shell, because Windows starts npm (npm.cmd) only that way.
      const build = spawnSync("npm run build:action", { stdio: "inherit", shell: true });
      if (build.status !== 0) process.exit(build.status ?? 1);
      console.log("\nNext: review the changelog section, run `npm run check`, and open the release PR.");
    } else if (command === "pin-plugin") {
      const changed = pinPlugin(process.cwd(), version ?? "");
      console.log(changed.length ? `Pinned ${version} in:\n  ${changed.join("\n  ")}` : `The plugin already pins ${version}.`);
    } else {
      console.error("Usage: node scripts/release.mjs prepare <version> | pin-plugin <version>");
      process.exit(2);
    }
  } catch (error) {
    console.error(`release: ${error.message}`);
    process.exit(1);
  }
}
