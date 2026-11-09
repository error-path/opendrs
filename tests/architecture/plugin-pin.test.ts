import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");
const manifestPath = "plugin/.claude-plugin/plugin.json";
const pinnedFiles = (readdirSync(resolve(__dirname, "../../plugin"), { recursive: true, encoding: "utf8" }) as string[])
  .filter((path) => /\.(md|json)$/.test(path) && !/^evals[\/]/.test(path))
  .map((path) => `plugin/${path}`);

// The directory blocks unpinned npx launchers, and a partial bump would run mixed CLI versions.
describe("plugin version pins", () => {
  const mentions = pinnedFiles.flatMap((path) => [...read(path).matchAll(/(?:npx|bunx|pnpm dlx|yarn dlx)(?: -\S+)* @error-path\/opendrs(@[^\s`"]+)?/g)]);
  const manifest = JSON.parse(read(manifestPath)) as { version: string; mcpServers: { opendrs: { args: string[] } } };

  it("pins every npx call in the plugin to the manifest version", () => {
    expect(mentions.length).toBeGreaterThan(0);
    for (const [text, pin] of mentions) expect(pin, text).toBe(`@${manifest.version}`);
  });

  it("pins the MCP server to the manifest version", () => {
    expect(manifest.mcpServers.opendrs.args).toContain(`@error-path/opendrs@${manifest.version}`);
  });
});
