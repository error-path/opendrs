import { parseArgs } from "node:util";
import { loadConfig } from "../../domain/config.js";
import { OpendrsError } from "../../domain/types.js";
import { scoreDiff } from "../../engine.js";
import { git } from "../../git/exec.js";
import { describeEmptyDiff, isEmptyDiff } from "../../policy/gate.js";
import { renderMarkdown, renderText } from "../../report/markdown.js";
import { parseScoreArg } from "../args.js";
import { defaultBase, repoRoot } from "../repo.js";
import type { Command } from "../types.js";

export const scoreCommand: Command = {
  name: "score",
  summary: "Score the diff between two refs (default: base branch...HEAD)",
  help: `Usage: opendrs score [options]

Score the change from the merge-base of <base> and <head> to <head>.

Options:
  --base <ref>        Base ref (default: origin/HEAD's target, else main, else master)
  --head <ref>        Head ref (default: HEAD)
  --title <text>      Title to score with (default: the head commit subject)
  --json              Print the full result as JSON
  --markdown          Print the PR-comment markdown
  --fail-above <x>    Exit 1 when the score is above x (0..1)
  --no-llm            Skip the LLM judge even when llm.enabled is true

Exit codes: 0 ok, 1 score above --fail-above, 2 error.`,

  async run(args, io) {
    const { values } = parseArgs({
      args,
      options: {
        base: { type: "string" },
        head: { type: "string" },
        title: { type: "string" },
        json: { type: "boolean" },
        markdown: { type: "boolean" },
        "fail-above": { type: "string" },
        "no-llm": { type: "boolean" },
      },
    });
    if (values.json && values.markdown) throw new OpendrsError("--json and --markdown cannot be combined", "usage");
    const failAbove = values["fail-above"] === undefined ? undefined : parseScoreArg("--fail-above", values["fail-above"]);

    const repoDir = await repoRoot(io.cwd);
    if ((await git(repoDir, ["rev-parse", "--is-shallow-repository"])).trim() === "true") {
      io.err(
        "opendrs: warning: this is a shallow clone, so history signals are incomplete; run `git fetch --unshallow` (in CI: actions/checkout with fetch-depth: 0)",
      );
    }
    const config = await loadConfig(repoDir);
    const baseRef = values.base ?? (await defaultBase(repoDir));
    const headRef = values.head ?? "HEAD";
    const result = await scoreDiff({ repoDir, config, base: baseRef, head: headRef, title: values.title, llm: values["no-llm"] ? null : undefined });

    // A verdict on an empty diff would only rate the author; scripts still get the full result with --json.
    if (!values.json && isEmptyDiff(result.policy)) {
      io.out(describeEmptyDiff(baseRef, headRef));
      return 0;
    }
    if (values.json) io.out(JSON.stringify(result, null, 2));
    else if (values.markdown) io.out(renderMarkdown(result));
    else io.out(renderText(result));
    return failAbove !== undefined && result.score > failAbove ? 1 : 0;
  },
};
