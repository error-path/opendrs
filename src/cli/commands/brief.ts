import { parseArgs } from "node:util";
import { renderBriefMarkdown } from "../../brief/render.js";
import { selfCheckItems } from "../../brief/selfcheck.js";
import { loadConfig } from "../../domain/config.js";
import { OpendrsError } from "../../domain/types.js";
import { scoreDiff } from "../../engine.js";
import { describeEmptyDiff, isEmptyDiff } from "../../policy/gate.js";
import { parsePositiveInt } from "../args.js";
import { defaultBase, repoRoot } from "../repo.js";
import type { Command } from "../types.js";

/** Below this, the mandatory sections (verdict, needs a human, not ranked) alone cost roughly that many tokens. */
const MIN_MAX_TOKENS = 300;

export const briefCommand: Command = {
  name: "brief",
  summary: "Build the review brief for the diff between two refs",
  help: `Usage: opendrs brief [options]

Build a token-budgeted review brief for the change from the merge-base of <base>
and <head> to <head>: where to look first, what to check, what is safe to skim
and what still needs a human. It never gates: the exit code is 0 unless it fails.

Options:
  --base <ref>         Base ref (default: origin/HEAD's target, else main, else master)
  --head <ref>         Head ref (default: HEAD)
  --json               Print the full ReviewBrief as JSON
  --max-tokens <n>     Override brief.maxTokens (default 2500, min 300, max 6000)
  --no-llm             Skip the LLM judge even when llm.enabled is true
  --self-check-template Print the ids (captain facts, reviewFirst hunks, check questions) a pre-PR
                        self-check should address, as JSON, instead of the brief.

Exit codes: 0 ok, 2 error.`,

  async run(args, io) {
    const { values } = parseArgs({
      args,
      options: {
        base: { type: "string" },
        head: { type: "string" },
        json: { type: "boolean" },
        "max-tokens": { type: "string" },
        "no-llm": { type: "boolean" },
        "self-check-template": { type: "boolean" },
      },
    });
    const maxTokens = parsePositiveInt("--max-tokens", values["max-tokens"]);
    if (maxTokens !== undefined && maxTokens < MIN_MAX_TOKENS) {
      throw new OpendrsError(`--max-tokens must be at least ${MIN_MAX_TOKENS}, got '${values["max-tokens"]}'`, "usage");
    }

    const repoDir = await repoRoot(io.cwd);
    const config = await loadConfig(repoDir);
    const baseRef = values.base ?? (await defaultBase(repoDir));
    const headRef = values.head ?? "HEAD";
    const result = await scoreDiff({ repoDir, config, base: baseRef, head: headRef, llm: values["no-llm"] ? null : undefined, brief: { maxTokens } });
    if (!result.brief) throw new OpendrsError("internal error: scoreDiff did not build a brief", "io");
    // The JSON forms stay parseable for scripts and agents; their verdict already routes to a human.
    if (!values.json && !values["self-check-template"] && isEmptyDiff(result.policy)) {
      io.out(describeEmptyDiff(baseRef, headRef));
      return 0;
    }

    if (values["self-check-template"]) {
      io.out(JSON.stringify(selfCheckItems(result.brief), null, 2));
      return 0;
    }
    io.out(values.json ? JSON.stringify(result.brief, null, 2) : renderBriefMarkdown(result.brief));
    return 0;
  },
};
