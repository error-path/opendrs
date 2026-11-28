import { describe, expect, it } from "vitest";
import { addedPackages, manifestKind } from "../../src/architecture/manifests.js";

describe("addedPackages: package.json", () => {
  const base = JSON.stringify({ dependencies: { foo: "^1.0.0" }, devDependencies: { eslint: "^8.0.0" } });

  it("a new dependencies name is runtime", () => {
    const head = JSON.stringify({ dependencies: { foo: "^1.0.0", jsonwebtoken: "^9.0.0" }, devDependencies: { eslint: "^8.0.0" } });
    expect(addedPackages("package.json", base, head)).toEqual({ runtime: ["jsonwebtoken"], dev: [] });
  });

  it("a new devDependencies name is dev", () => {
    const head = JSON.stringify({ dependencies: { foo: "^1.0.0" }, devDependencies: { eslint: "^8.0.0", vitest: "^2.0.0" } });
    expect(addedPackages("package.json", base, head)).toEqual({ runtime: [], dev: ["vitest"] });
  });

  it("a version bump is not an addition", () => {
    const head = JSON.stringify({ dependencies: { foo: "^2.0.0" }, devDependencies: { eslint: "^8.0.0" } });
    expect(addedPackages("package.json", base, head)).toEqual({ runtime: [], dev: [] });
  });

  it("invalid JSON yields an error", () => {
    const result = addedPackages("package.json", base, "{ not json");
    expect(result).toHaveProperty("error");
  });
});

describe("addedPackages: go.mod", () => {
  const base = "module example.com/app\n\ngo 1.21\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n)\n";
  const head = "module example.com/app\n\ngo 1.21\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n\tgithub.com/baz/qux v0.1.0\n)\n";

  it("a new require entry is runtime", () => {
    expect(addedPackages("go.mod", base, head)).toEqual({ runtime: ["github.com/baz/qux"], dev: [] });
  });
});

describe("addedPackages: requirements.txt", () => {
  const base = "flask==2.0.0\n# a comment\n\nrequests>=2.0\n";
  const head = "flask==2.0.0\n# a comment\n\nrequests>=2.0\npyjwt==2.8.0\n";

  it("a new line is runtime, ignoring comments and blank lines", () => {
    expect(addedPackages("requirements.txt", base, head)).toEqual({ runtime: ["pyjwt"], dev: [] });
  });
});

describe("addedPackages: pyproject.toml", () => {
  const base = '[project]\nname = "app"\ndependencies = [\n  "flask>=2.0",\n]\n\n[project.optional-dependencies]\ntest = ["pytest>=7"]\n';
  const head =
    '[project]\nname = "app"\ndependencies = [\n  "flask>=2.0",\n  "pyjwt>=2.0",\n]\n\n[project.optional-dependencies]\ntest = ["pytest>=7", "coverage>=6"]\n';

  it("a new [project] dependency is runtime; a new optional-dependencies entry is dev", () => {
    expect(addedPackages("pyproject.toml", base, head)).toEqual({ runtime: ["pyjwt"], dev: ["coverage"] });
  });

  it("an unclosed table header yields an error", () => {
    const result = addedPackages("pyproject.toml", base, '[project\nname = "app"\n');
    expect(result).toHaveProperty("error");
  });
});

describe("addedPackages: Cargo.toml", () => {
  const base = '[dependencies]\nserde = "1.0"\n\n[dev-dependencies]\nmockall = "0.11"\n';
  const head = '[dependencies]\nserde = "1.0"\njsonwebtoken = "9.0"\n\n[dev-dependencies]\nmockall = "0.11"\nproptest = "1.0"\n';

  it("a new [dependencies] entry is runtime; a new [dev-dependencies] entry is dev", () => {
    expect(addedPackages("Cargo.toml", base, head)).toEqual({ runtime: ["jsonwebtoken"], dev: ["proptest"] });
  });
});

describe("addedPackages: pom.xml", () => {
  const base = "<project><dependencies>\n<dependency><groupId>g</groupId><artifactId>foo</artifactId></dependency>\n</dependencies></project>";
  const head =
    "<project><dependencies>\n<dependency><groupId>g</groupId><artifactId>foo</artifactId></dependency>\n" +
    "<dependency><groupId>g</groupId><artifactId>junit</artifactId><scope>test</scope></dependency>\n</dependencies></project>";

  it("a dependency with <scope>test</scope> is dev", () => {
    expect(addedPackages("pom.xml", base, head)).toEqual({ runtime: [], dev: ["junit"] });
  });

  it("mismatched <dependency> tags yield an error", () => {
    const result = addedPackages("pom.xml", base, "<project><dependencies><dependency></dependencies></project>");
    expect(result).toHaveProperty("error");
  });
});

describe("addedPackages: build.gradle.kts", () => {
  const base = 'dependencies {\n    implementation("com.foo:bar:1.0")\n}\n';
  const head = 'dependencies {\n    implementation("com.foo:bar:1.0")\n    testImplementation("org.junit:junit:5.0")\n}\n';

  it("implementation is runtime; testImplementation is dev", () => {
    expect(addedPackages("build.gradle.kts", base, head)).toEqual({ runtime: [], dev: ["org.junit:junit"] });
  });
});

describe("addedPackages: Gemfile", () => {
  const base = 'gem "rails"\n';
  const head = 'gem "rails"\ngem "pry"\n\ngroup :test do\n  gem "rspec"\nend\n';

  it("a top-level gem is runtime; a gem in group :test is dev", () => {
    expect(addedPackages("Gemfile", base, head)).toEqual({ runtime: ["pry"], dev: ["rspec"] });
  });

  it("group lists separated by commas or spaces still open a group", () => {
    const head = 'group :development, :test do\n  gem "rspec"\nend\ngroup :tools :test do\n  gem "pry"\nend\n';
    expect(addedPackages("Gemfile", undefined, head)).toEqual({ runtime: [], dev: ["rspec", "pry"] });
  });

  it("a go.mod require line with a run of spaces and a line separator parses in linear time", () => {
    // `.` stops at \r but `\s` does not, so `require\s+(.+)$` used to retry every split of the spaces.
    const head = `module m\n\nrequire${" ".repeat(50_000)}a\rb\n`;
    const started = performance.now();
    expect(addedPackages("go.mod", undefined, head)).toEqual({ runtime: [], dev: [] });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("a PR's group line without `do` parses in linear time, not by catastrophic backtracking", () => {
    const head = `group ${":a  ".repeat(18)}x\ngem "rails"\n`;
    const started = performance.now();
    expect(addedPackages("Gemfile", undefined, head)).toEqual({ runtime: ["rails"], dev: [] });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("addedPackages: new manifest", () => {
  it("base undefined (new manifest) reports every name as added", () => {
    const head = JSON.stringify({ dependencies: { foo: "^1.0.0" }, devDependencies: { eslint: "^8.0.0" } });
    expect(addedPackages("package.json", undefined, head)).toEqual({ runtime: ["foo"], dev: ["eslint"] });
  });
});

describe("addedPackages: pyproject.toml PEP 508 markers and extras", () => {
  it("an environment marker with a nested single-quoted value does not corrupt the parsed name", () => {
    const base = '[project]\nname = "app"\ndependencies = [\n  "flask>=2.0",\n]\n';
    const head =
      '[project]\nname = "app"\ndependencies = [\n  "flask>=2.0",\n  "uvloop>=0.15.2; sys_platform != \'win32\'",\n]\n\n' +
      '[project.optional-dependencies]\nspeedups = ["winloop>=0.5.0; sys_platform == \'win32\'"]\n';
    expect(addedPackages("pyproject.toml", base, head)).toEqual({ runtime: ["uvloop"], dev: ["winloop"] });
  });

  it("a PEP 508 extras bracket is stripped from the parsed name", () => {
    const base = '[project]\nname = "app"\ndependencies = [\n  "flask>=2.0",\n]\n';
    const head = '[project]\nname = "app"\ndependencies = [\n  "flask>=2.0",\n  "uvloop[full]>=0.15; platform_system != \'Windows\'",\n]\n';
    expect(addedPackages("pyproject.toml", base, head)).toEqual({ runtime: ["uvloop"], dev: [] });
  });

  it("a version-only bump on a marker-qualified dependency is not an addition", () => {
    const base = '[project]\nname = "app"\ndependencies = [\n  "uvloop>=0.15; sys_platform != \'win32\'",\n]\n';
    const head = '[project]\nname = "app"\ndependencies = [\n  "uvloop>=0.16; sys_platform != \'win32\'",\n]\n';
    expect(addedPackages("pyproject.toml", base, head)).toEqual({ runtime: [], dev: [] });
  });
});

describe("addedPackages: go.mod // indirect", () => {
  it("promoting a dependency from // indirect to direct is a new runtime dependency", () => {
    const base = "module example.com/app\n\nrequire (\n\tgithub.com/charmbracelet/x/ansi v1.2.3 // indirect\n)\n";
    const head = "module example.com/app\n\nrequire (\n\tgithub.com/charmbracelet/x/ansi v1.2.3\n)\n";
    expect(addedPackages("go.mod", base, head)).toEqual({ runtime: ["github.com/charmbracelet/x/ansi"], dev: [] });
  });

  it("a newly added indirect-only dependency is a dev (info) fact, not runtime", () => {
    const base = "module example.com/app\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n)\n";
    const head = "module example.com/app\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n\tgithub.com/new/indirect v0.1.0 // indirect\n)\n";
    expect(addedPackages("go.mod", base, head)).toEqual({ runtime: [], dev: ["github.com/new/indirect"] });
  });

  it("a version-only bump on a direct dependency is not an addition", () => {
    const base = "module example.com/app\n\nrequire github.com/foo/bar v1.2.3\n";
    const head = "module example.com/app\n\nrequire github.com/foo/bar v1.3.0\n";
    expect(addedPackages("go.mod", base, head)).toEqual({ runtime: [], dev: [] });
  });

  it("an unclosed require block yields an error, not a throw", () => {
    const result = addedPackages("go.mod", "module example.com/app\n", "module example.com/app\n\nrequire (\n\tgithub.com/foo/bar v1.2.3\n");
    expect(result).toHaveProperty("error");
  });
});

describe("addedPackages: Cargo.toml target/workspace tables", () => {
  it("a new dependency under a target cfg table is runtime, like the plain table", () => {
    const base = '[dependencies]\nserde = "1.0"\n';
    const head = '[dependencies]\nserde = "1.0"\n\n[target.\'cfg(windows)\'.dependencies]\nwinapi-util = "0.1"\n';
    expect(addedPackages("Cargo.toml", base, head)).toEqual({ runtime: ["winapi-util"], dev: [] });
  });

  it("a new dev-dependency under a target cfg table is dev", () => {
    const base = '[dependencies]\nserde = "1.0"\n';
    const head = '[dependencies]\nserde = "1.0"\n\n[target.\'cfg(unix)\'.dev-dependencies]\nnix = "0.27"\n';
    expect(addedPackages("Cargo.toml", base, head)).toEqual({ runtime: [], dev: ["nix"] });
  });

  it("a new dependency under [workspace.dependencies] is runtime", () => {
    const base = '[workspace]\nmembers = ["a"]\n';
    const head = '[workspace]\nmembers = ["a"]\n\n[workspace.dependencies]\njsonwebtoken = "9.0"\n';
    expect(addedPackages("Cargo.toml", base, head)).toEqual({ runtime: ["jsonwebtoken"], dev: [] });
  });

  it("dep = { workspace = true } added in a member is not a new external package", () => {
    const base = '[dependencies]\nserde = "1.0"\n';
    const head = '[dependencies]\nserde = "1.0"\njsonwebtoken = { workspace = true }\n';
    expect(addedPackages("Cargo.toml", base, head)).toEqual({ runtime: [], dev: [] });
  });

  it("a version-only bump under a target cfg table is not an addition", () => {
    const base = '[target.\'cfg(windows)\'.dependencies]\nwinapi-util = "0.1"\n';
    const head = '[target.\'cfg(windows)\'.dependencies]\nwinapi-util = "0.2"\n';
    expect(addedPackages("Cargo.toml", base, head)).toEqual({ runtime: [], dev: [] });
  });

  it("an unclosed table header in Cargo.toml yields an error", () => {
    const result = addedPackages("Cargo.toml", '[dependencies]\nserde = "1.0"\n', '[dependencies\nserde = "1.0"\n');
    expect(result).toHaveProperty("error");
  });
});

describe("addedPackages: Package.swift", () => {
  const base =
    'import PackageDescription\n\nlet package = Package(\n  name: "Vapor",\n  dependencies: [\n    .package(url: "https://github.com/vapor/vapor-core.git", from: "4.0.0"),\n  ]\n)\n';

  it("manifestKind recognizes Package.swift", () => {
    expect(manifestKind("Package.swift")).toBe("Package.swift");
  });

  it("a new .package(url:) entry is a runtime dependency, named from the URL", () => {
    const head =
      'import PackageDescription\n\nlet package = Package(\n  name: "Vapor",\n  dependencies: [\n    .package(url: "https://github.com/vapor/vapor-core.git", from: "4.0.0"),\n    .package(url: "https://github.com/apple/swift-nio-http3.git", from: "1.0.0"),\n  ]\n)\n';
    expect(addedPackages("Package.swift", base, head)).toEqual({ runtime: ["swift-nio-http3"], dev: [] });
  });

  it("an explicit .package(name:) wins over the URL-derived name", () => {
    const head = base.replace(
      '.package(url: "https://github.com/vapor/vapor-core.git", from: "4.0.0"),',
      '.package(url: "https://github.com/vapor/vapor-core.git", from: "4.0.0"),\n    .package(name: "SwiftNIO", url: "https://github.com/apple/swift-nio.git", from: "2.0.0"),',
    );
    expect(addedPackages("Package.swift", base, head)).toEqual({ runtime: ["SwiftNIO"], dev: [] });
  });

  it("a version-only bump is not an addition", () => {
    const head = base.replace('from: "4.0.0"', 'from: "4.1.0"');
    expect(addedPackages("Package.swift", base, head)).toEqual({ runtime: [], dev: [] });
  });

  it("an unterminated .package(...) call yields an error, not a throw", () => {
    const result = addedPackages(
      "Package.swift",
      base,
      'let package = Package(\n  dependencies: [\n    .package(url: "https://github.com/foo/bar.git", from: "1.0.0"\n',
    );
    expect(result).toHaveProperty("error");
  });
});
