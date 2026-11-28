/** Per-manifest dependency parsers (spec §6.3). No new dependencies: line-oriented scanners for TOML/XML/Gradle/Gemfile, JSON.parse for package.json. */

type Buckets = { runtime: Set<string>; dev: Set<string> };
type ParseResult = Buckets | { error: string };

type ManifestKind = "package.json" | "go.mod" | "requirements.txt" | "pyproject.toml" | "Cargo.toml" | "pom.xml" | "build.gradle" | "Gemfile" | "Package.swift";

/** The manifest kind a changed path is, or undefined when it is not one §6.3 covers. */
export function manifestKind(path: string): ManifestKind | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name === "package.json") return "package.json";
  if (name === "go.mod") return "go.mod";
  if (/^requirements[\w.-]*\.txt$/.test(name)) return "requirements.txt";
  if (name === "pyproject.toml") return "pyproject.toml";
  if (name === "Cargo.toml") return "Cargo.toml";
  if (name === "pom.xml") return "pom.xml";
  if (name === "build.gradle" || name === "build.gradle.kts") return "build.gradle";
  if (name === "Gemfile") return "Gemfile";
  if (name === "Package.swift") return "Package.swift";
  return undefined;
}

export const isManifestPath = (path: string): boolean => manifestKind(path) !== undefined;

function parsePackageJson(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { error: `invalid JSON: ${(e as Error).message}` };
  }
  if (typeof json !== "object" || json === null) return { error: "not a JSON object" };
  const obj = json as Record<string, unknown>;
  const names = (key: string): string[] => {
    const v = obj[key];
    return v && typeof v === "object" ? Object.keys(v as Record<string, unknown>) : [];
  };
  return {
    runtime: new Set([...names("dependencies"), ...names("peerDependencies"), ...names("optionalDependencies")]),
    dev: new Set(names("devDependencies")),
  };
}

/**
 * `// indirect` decides the bucket (spec §6.3's `require`, plus the field-test gap: a dependency
 * promoted from indirect to direct is a new *runtime* dependency; a dependency that is only ever
 * indirect is info at most, so it goes in `dev` the same way other manifests' info-weight names do.
 */
function parseGoMod(text: string): ParseResult {
  const direct = new Set<string>();
  const indirect = new Set<string>();
  let inBlock = false;

  const addEntry = (line: string): void => {
    const m = /^(\S+)\s+\S+/.exec(line);
    if (!m) return;
    (/\/\/\s*indirect\b/.test(line) ? indirect : direct).add(m[1]!);
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("require (")) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line === ")") {
        inBlock = false;
        continue;
      }
      addEntry(line);
      continue;
    }
    const m = /^require\s+(.+)$/.exec(line);
    if (m) addEntry(m[1]!);
  }
  if (inBlock) return { error: "unclosed require block" };

  for (const name of direct) indirect.delete(name); // a name is never both; direct wins
  return { runtime: direct, dev: indirect };
}

function parseRequirementsTxt(text: string): ParseResult {
  const runtime = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0]!.trim();
    if (!line || line.startsWith("-")) continue;
    const m = /^([A-Za-z0-9._-]+)/.exec(line);
    if (m) runtime.add(m[1]!);
  }
  return { runtime, dev: new Set() };
}

/** Splits a TOML document into dotted-table -> raw assignment lines (comments stripped, multi-line arrays joined). */
function splitTomlSections(text: string): Map<string, string[]> | { error: string } {
  const sections = new Map<string, string[]>();
  let current = "";
  sections.set(current, []);
  let pendingArray: string[] | undefined;

  const balanced = (s: string) => {
    let depth = 0;
    for (const ch of s) {
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }
    return depth <= 0;
  };

  for (const raw of text.split("\n")) {
    const line = raw.split(/(?<!["'])#/)[0]!.trimEnd();
    if (pendingArray) {
      pendingArray.push(line);
      if (balanced(pendingArray.join("\n"))) {
        sections.get(current)!.push(pendingArray.join(" "));
        pendingArray = undefined;
      }
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) {
      const header = /^\[\[?([^\]]*)\]?\]?$/.exec(trimmed);
      if (!header || !trimmed.endsWith("]")) return { error: `unclosed table header: ${trimmed}` };
      current = header[1]!.trim().replace(/"/g, "").replace(/'/g, "");
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const value = line.slice(eq + 1).trim();
    if (value.startsWith("[") && !balanced(value)) {
      pendingArray = [line];
      continue;
    }
    sections.get(current)!.push(line);
  }
  if (pendingArray) return { error: "unclosed array" };
  return sections;
}

// Each quoted TOML string is matched with its OWN delimiter (not an alternating ["'] class): a PEP 508
// requirement like `"winloop>=0.5.0; sys_platform == 'win32'"` nests a single-quoted marker value
// inside a double-quoted array entry, and an alternating class desyncs across the rest of the line.
const quotedStrings = (line: string): string[] => [...line.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]!);
const stripVersionSpec = (spec: string): string => /^([A-Za-z0-9._-]+)/.exec(spec.trim())?.[1] ?? spec.trim();
const assignmentKey = (line: string): string | undefined => /^([A-Za-z0-9_-]+)\s*=/.exec(line.trim())?.[1];

function parsePyprojectToml(text: string): ParseResult {
  const sections = splitTomlSections(text);
  if ("error" in sections) return sections;
  const runtime = new Set<string>();
  const dev = new Set<string>();

  for (const line of sections.get("project") ?? []) {
    if (assignmentKey(line) !== "dependencies") continue;
    for (const spec of quotedStrings(line)) runtime.add(stripVersionSpec(spec));
  }
  for (const line of sections.get("project.optional-dependencies") ?? []) {
    for (const spec of quotedStrings(line)) dev.add(stripVersionSpec(spec));
  }
  for (const line of sections.get("tool.poetry.dependencies") ?? []) {
    const name = assignmentKey(line);
    if (name && name !== "python") runtime.add(name);
  }
  for (const [name, lines] of sections) {
    if (!/^tool\.poetry\.group\.[^.]+\.dependencies$/.test(name)) continue;
    for (const line of lines) {
      const key = assignmentKey(line);
      if (key) dev.add(key);
    }
  }
  return { runtime, dev };
}

/** A dependency table name, stripped of an optional `target.'cfg(...)'.` or `workspace.` prefix (field-test gap: both are parsed like their plain counterparts). */
const CARGO_TABLE = /^(?:target\.[^.]+\.|workspace\.)?(dependencies|dev-dependencies|build-dependencies)$/;
// `dep = { workspace = true }` inherits from `[workspace.dependencies]`; it is not a new external
// package in the member's own manifest (that fact, if any, belongs to the workspace root's diff).
const WORKSPACE_INHERITED = /=\s*\{\s*workspace\s*=\s*true\b/;

function parseCargoToml(text: string): ParseResult {
  const sections = splitTomlSections(text);
  if ("error" in sections) return sections;
  const runtime = new Set<string>();
  const dev = new Set<string>();
  for (const [header, lines] of sections) {
    const kind = CARGO_TABLE.exec(header)?.[1];
    if (!kind) continue;
    const bucket = kind === "dependencies" ? runtime : dev;
    for (const line of lines) {
      if (WORKSPACE_INHERITED.test(line)) continue;
      const name = assignmentKey(line);
      if (name) bucket.add(name);
    }
  }
  return { runtime, dev };
}

function parsePomXml(text: string): ParseResult {
  const opens = text.match(/<dependency>/g)?.length ?? 0;
  const closes = text.match(/<\/dependency>/g)?.length ?? 0;
  if (opens !== closes) return { error: "mismatched <dependency> tags" };
  const runtime = new Set<string>();
  const dev = new Set<string>();
  for (const m of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const block = m[1]!;
    const artifactId = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(block)?.[1];
    if (!artifactId) continue;
    (/<scope>\s*test\s*<\/scope>/.test(block) ? dev : runtime).add(artifactId);
  }
  return { runtime, dev };
}

const GRADLE_RUNTIME = new Set(["implementation", "api", "runtimeOnly"]);
const GRADLE_DEV = new Set(["compileOnly"]);

function parseGradle(text: string): ParseResult {
  const runtime = new Set<string>();
  const dev = new Set<string>();
  const re = /^\s*([A-Za-z]+)[\s(]+["']([^"']+)["']/;
  for (const raw of text.split("\n")) {
    const m = re.exec(raw);
    if (!m) continue;
    const [, config, coordinate] = m;
    const name = coordinate!.split(":").slice(0, 2).join(":");
    if (/^test/i.test(config!) || GRADLE_DEV.has(config!)) dev.add(name);
    else if (GRADLE_RUNTIME.has(config!)) runtime.add(name);
  }
  return { runtime, dev };
}

/**
 * Minimal Gemfile parser: `gem "name"` lines, counted as dev inside a `group … do` block that lists
 * `:development` or `:test`.
 *
 * @param text - The Gemfile's contents, from the PR head or the base commit (untrusted).
 * @returns The gem names, split into runtime and dev.
 */
function parseGemfile(text: string): ParseResult {
  const runtime = new Set<string>();
  const dev = new Set<string>();
  const stack: boolean[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // Each separator is a comma or whitespace, never an optional mix: `\s*,?\s*` let a failed match backtrack exponentially (ReDoS).
    const group = /^group\s+((?::\w+(?:\s*,\s*|\s+))+)do\b/.exec(line);
    if (group) {
      stack.push(/:development|:test/.test(group[1]!));
      continue;
    }
    if (line === "end") {
      stack.pop();
      continue;
    }
    const gem = /^gem\s+["']([^"']+)["']/.exec(line);
    if (gem) (stack.some(Boolean) ? dev : runtime).add(gem[1]!);
  }
  return { runtime, dev };
}

/** Minimal SwiftPM parser: `.package(url: "…/name.git", …)` or `.package(name: "…", …)`, one call at a time via paren-balance matching (a call may span several lines). */
function parsePackageSwift(text: string): ParseResult {
  const runtime = new Set<string>();
  const marker = ".package(";
  let from = 0;
  for (let idx = text.indexOf(marker, from); idx !== -1; idx = text.indexOf(marker, from)) {
    const open = idx + marker.length - 1;
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      if (text[end] === "(") depth++;
      else if (text[end] === ")" && --depth === 0) break;
    }
    if (depth !== 0) return { error: "unterminated .package(...) call" };
    const args = text.slice(open + 1, end);
    const name = /\bname\s*:\s*"([^"]+)"/.exec(args)?.[1] ?? /\burl\s*:\s*"([^"]+)"/.exec(args)?.[1]?.split("/").pop()?.replace(/\.git$/, "");
    if (name) runtime.add(name);
    from = end + 1;
  }
  return { runtime, dev: new Set() };
}

function parseManifest(kind: ManifestKind, text: string): ParseResult {
  switch (kind) {
    case "package.json":
      return parsePackageJson(text);
    case "go.mod":
      return parseGoMod(text);
    case "requirements.txt":
      return parseRequirementsTxt(text);
    case "pyproject.toml":
      return parsePyprojectToml(text);
    case "Cargo.toml":
      return parseCargoToml(text);
    case "pom.xml":
      return parsePomXml(text);
    case "build.gradle":
      return parseGradle(text);
    case "Gemfile":
      return parseGemfile(text);
    case "Package.swift":
      return parsePackageSwift(text);
  }
}

/** Names newly present in `head`'s runtime/dev buckets that were not in `base`'s (every name, when `base` is undefined: a new manifest). */
export function addedPackages(path: string, base: string | undefined, head: string): { runtime: string[]; dev: string[] } | { error: string } {
  const kind = manifestKind(path);
  if (!kind) return { error: `unsupported manifest: ${path}` };
  const headParsed = parseManifest(kind, head);
  if ("error" in headParsed) return headParsed;
  if (base === undefined) return { runtime: [...headParsed.runtime], dev: [...headParsed.dev] };
  const baseParsed = parseManifest(kind, base);
  if ("error" in baseParsed) return baseParsed;
  return {
    runtime: [...headParsed.runtime].filter((n) => !baseParsed.runtime.has(n)),
    dev: [...headParsed.dev].filter((n) => !baseParsed.dev.has(n)),
  };
}
