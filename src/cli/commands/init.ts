import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { CONFIG_FILE } from "../../domain/config.js";
import { repoFileToWrite, repoRoot } from "../repo.js";
import { CONFIG_TEMPLATE, WORKFLOW_TEMPLATE } from "../templates.js";
import type { Command } from "../types.js";

const exists = (p: string) => access(p).then(() => true, () => false);

export const initCommand: Command = {
  name: "init",
  summary: "Write .opendrs.yml and a GitHub workflow",
  help: `Usage: opendrs init [--force]

Write ${CONFIG_FILE} (every default, commented) and .github/workflows/opendrs.yml
(comment-only) at the repository root. Existing files are kept unless --force.`,

  async run(args, io) {
    const { values } = parseArgs({ args, options: { force: { type: "boolean" } } });
    const repoDir = await repoRoot(io.cwd);
    const files: Array<[string, string]> = [
      [CONFIG_FILE, CONFIG_TEMPLATE],
      [".github/workflows/opendrs.yml", WORKFLOW_TEMPLATE],
    ];
    for (const [rel, content] of files) {
      const abs = await repoFileToWrite(repoDir, rel);
      if (!values.force && (await exists(abs))) {
        io.out(`kept ${rel} (exists; use --force to overwrite)`);
        continue;
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
      io.out(`wrote ${rel}`);
    }
    io.out("Next: commit both files to your default branch, then open a PR to see the score.");
    return 0;
  },
};
