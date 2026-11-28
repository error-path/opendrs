import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bumpVersion, pinDogfood, pinPlugin, releaseNotes } from "../../scripts/release.mjs";

let rootDir: string;

/** The release commit the dogfood action pins before each test. */
const OLD_COMMIT = "a".repeat(40);
/** A release commit to pin. */
const NEW_COMMIT = "0123456789abcdef0123456789abcdef01234567";
/** The dogfood action's path under the repository root. */
const DOGFOOD_FILE = ".github/actions/opendrs-release/action.yml";

/** Writes `content` to `relativePath` under the temporary repository root. */
const writeRepoFile = (relativePath: string, content: string) => {
  const path = join(rootDir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

/** Reads `relativePath` under the temporary repository root. */
const readRepoFile = (relativePath: string) => readFileSync(join(rootDir, relativePath), "utf8");

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "opendrs-release-"));
  writeRepoFile("package.json", '{\n  "name": "@error-path/opendrs",\n  "version": "0.5.2",\n  "dependencies": { "zod": "^4.6.7" }\n}\n');
  // A dependency that happens to have the same version must keep it.
  writeRepoFile(
    "package-lock.json",
    '{\r\n  "name": "@error-path/opendrs",\r\n  "version": "0.5.2",\r\n  "packages": {\r\n    "": {\r\n      "version": "0.5.2"\r\n    },\r\n    "node_modules/some-dep": {\r\n      "version": "0.5.2"\r\n    }\r\n  }\r\n}\r\n',
  );
  writeRepoFile("src/version.ts", 'export const VERSION = "0.5.2";\n');
  writeRepoFile("server.json", '{\n  "version": "0.5.2",\n  "packages": [{ "identifier": "@error-path/opendrs", "version": "0.5.2" }]\n}\n');
  writeRepoFile("tests/fixtures/golden-full-score.json", '{\n  "version": "0.5.2",\n  "model": { "version": 1 }\n}\n');
  writeRepoFile("CHANGELOG.md", "# Changelog\n\n## Unreleased\n\n### Added\n\n- Something.\n\n## 0.5.2 - 2026-11-12\n");
  writeRepoFile("plugin/.claude-plugin/plugin.json", '{\n  "version": "0.5.2",\n  "args": ["-y", "@error-path/opendrs@0.5.2", "mcp"]\n}\n');
  writeRepoFile("plugin/commands/opendrs-review.md", "Run !`npx @error-path/opendrs@0.5.2 brief`.\n");
  writeRepoFile("plugin/skills/opendrs/SKILL.md", "npx @error-path/opendrs@0.5.2 score\nnpx @error-path/opendrs@0.5.2 brief\n");
  writeRepoFile("llms-install.md", '"args": ["-y", "@error-path/opendrs@0.5.2", "mcp"]\n`npx -y @error-path/opendrs@0.5.2 mcp`\n');
  writeRepoFile(DOGFOOD_FILE, `runs:\n  steps:\n    - uses: error-path/opendrs@${OLD_COMMIT} # v0.5.2\n`);
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe("bumpVersion", () => {
  it("sets the new version in every file that names the package's own version", () => {
    bumpVersion(rootDir, "0.6.0", "2026-11-16");
    expect(JSON.parse(readRepoFile("package.json")).version).toBe("0.6.0");
    const lock = JSON.parse(readRepoFile("package-lock.json"));
    expect([lock.version, lock.packages[""].version]).toEqual(["0.6.0", "0.6.0"]);
    expect(readRepoFile("src/version.ts")).toBe('export const VERSION = "0.6.0";\n');
    const server = JSON.parse(readRepoFile("server.json"));
    expect([server.version, server.packages[0].version]).toEqual(["0.6.0", "0.6.0"]);
    expect(JSON.parse(readRepoFile("tests/fixtures/golden-full-score.json"))).toEqual({ version: "0.6.0", model: { version: 1 } });
  });

  it("keeps a dependency that has the same version as the package, and the file's line endings", () => {
    bumpVersion(rootDir, "0.6.0", "2026-11-16");
    const lockText = readRepoFile("package-lock.json");
    expect(JSON.parse(lockText).packages["node_modules/some-dep"].version).toBe("0.5.2");
    expect(lockText).not.toMatch(/[^\r]\n/);
  });

  it("turns the Unreleased changelog section into the release's dated section", () => {
    bumpVersion(rootDir, "0.6.0", "2026-11-16");
    expect(readRepoFile("CHANGELOG.md")).toBe("# Changelog\n\n## 0.6.0 - 2026-11-16\n\n### Added\n\n- Something.\n\n## 0.5.2 - 2026-11-12\n");
  });

  it("returns the files it changed, relative to the root", () => {
    expect(bumpVersion(rootDir, "0.6.0", "2026-11-16").sort()).toEqual(
      ["CHANGELOG.md", "package-lock.json", "package.json", "server.json", "src/version.ts", "tests/fixtures/golden-full-score.json"].sort(),
    );
  });

  it("leaves the plugin pins alone: they move only after npm has the version", () => {
    bumpVersion(rootDir, "0.6.0", "2026-11-16");
    expect(readRepoFile("plugin/skills/opendrs/SKILL.md")).toContain("@error-path/opendrs@0.5.2");
  });

  it.each(["v0.6.0", "0.6", "0.6.0;id", "latest", ""])("refuses %j as a version", (version) => {
    expect(() => bumpVersion(rootDir, version, "2026-11-16")).toThrow(/not a version/);
    expect(readRepoFile("package.json")).toContain('"0.5.2"');
  });

  it("refuses the version the package already has", () => {
    expect(() => bumpVersion(rootDir, "0.5.2", "2026-11-16")).toThrow(/already/);
  });

  it("refuses to run when the changelog has no Unreleased section, and changes nothing", () => {
    writeRepoFile("CHANGELOG.md", "# Changelog\n\n## 0.5.2 - 2026-11-12\n");
    expect(() => bumpVersion(rootDir, "0.6.0", "2026-11-16")).toThrow(/Unreleased/);
    expect(readRepoFile("package.json")).toContain('"0.5.2"');
  });
});

describe("pinPlugin", () => {
  it("sets the plugin's version and every pinned npx call to the release", () => {
    pinPlugin(rootDir, "0.6.0");
    expect(JSON.parse(readRepoFile("plugin/.claude-plugin/plugin.json"))).toEqual({ version: "0.6.0", args: ["-y", "@error-path/opendrs@0.6.0", "mcp"] });
    expect(readRepoFile("plugin/commands/opendrs-review.md")).toBe("Run !`npx @error-path/opendrs@0.6.0 brief`.\n");
    expect(readRepoFile("plugin/skills/opendrs/SKILL.md")).toBe("npx @error-path/opendrs@0.6.0 score\nnpx @error-path/opendrs@0.6.0 brief\n");
    expect(readRepoFile("llms-install.md")).toBe('"args": ["-y", "@error-path/opendrs@0.6.0", "mcp"]\n`npx -y @error-path/opendrs@0.6.0 mcp`\n');
  });

  it("returns only the files it changed, so a second run changes nothing", () => {
    expect(pinPlugin(rootDir, "0.6.0")).toHaveLength(4);
    expect(pinPlugin(rootDir, "0.6.0")).toEqual([]);
  });

  it("refuses a value that is not a version", () => {
    expect(() => pinPlugin(rootDir, "0.6.0 && id")).toThrow(/not a version/);
  });
});

describe("pinDogfood", () => {
  it("pins this repository's own opendrs step to the release commit, with the tag as a comment", () => {
    expect(pinDogfood(rootDir, "0.6.0", NEW_COMMIT)).toEqual([DOGFOOD_FILE]);
    expect(readRepoFile(DOGFOOD_FILE)).toBe(`runs:\n  steps:\n    - uses: error-path/opendrs@${NEW_COMMIT} # v0.6.0\n`);
    expect(pinDogfood(rootDir, "0.6.0", NEW_COMMIT)).toEqual([]);
  });

  it("refuses a commit that is not a full SHA, and a value that is not a version", () => {
    expect(() => pinDogfood(rootDir, "0.6.0", "v0.6.0")).toThrow(/not a full commit SHA/);
    expect(() => pinDogfood(rootDir, "0.6.0", NEW_COMMIT.slice(0, 7))).toThrow(/not a full commit SHA/);
    expect(() => pinDogfood(rootDir, "0.6.0 && id", NEW_COMMIT)).toThrow(/not a version/);
  });

  it("refuses to run when the file pins no release commit, and changes nothing", () => {
    writeRepoFile(DOGFOOD_FILE, "runs:\n  steps: []\n");
    expect(() => pinDogfood(rootDir, "0.6.0", NEW_COMMIT)).toThrow(/pins no opendrs release commit/);
    expect(readRepoFile(DOGFOOD_FILE)).toBe("runs:\n  steps: []\n");
  });
});

describe("releaseNotes", () => {
  it("returns the version's changelog section without its heading", () => {
    writeRepoFile("CHANGELOG.md", "# Changelog\n\n## 0.6.0 - 2026-11-20\n\n### Fixed\n\n- A bug.\n\n## 0.5.2 - 2026-11-12\n\n- Old.\n");
    expect(releaseNotes(rootDir, "0.6.0")).toBe("### Fixed\n\n- A bug.");
    expect(releaseNotes(rootDir, "0.5.2")).toBe("- Old.");
  });

  it("does not match a longer version that starts the same way, and reads CRLF files", () => {
    writeRepoFile("CHANGELOG.md", "## 0.6.10 - 2026-11-20\r\n\r\n- Ten.\r\n\r\n## 0.6.1 - 2026-11-19\r\n\r\n- One.\r\n");
    expect(releaseNotes(rootDir, "0.6.1")).toBe("- One.");
  });

  it("refuses a version with no section, or an empty one", () => {
    expect(() => releaseNotes(rootDir, "9.9.9")).toThrow(/no section for 9\.9\.9/);
    writeRepoFile("CHANGELOG.md", "## 0.6.0 - 2026-11-20\n\n## 0.5.2 - 2026-11-12\n");
    expect(() => releaseNotes(rootDir, "0.6.0")).toThrow(/no section for 0\.6\.0/);
  });
});
