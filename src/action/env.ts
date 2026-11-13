import { readFile } from "node:fs/promises";
import { OpendrsError } from "../domain/types.js";
import { GitHubClient } from "./github.js";
import { runAction, type ActionInputs, type NotifyChanges } from "./run.js";
import { runSweep, SWEEP_EVENTS } from "./sweep.js";
import { createWorkflowIO } from "./workflow.js";

/** Action inputs arrive as INPUT_<NAME> with the name upper-cased (hyphens kept). */
export function readInputs(env: NodeJS.ProcessEnv): ActionInputs {
  const get = (name: string) => (env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
  const bool = (name: string, fallback: boolean) => {
    const v = get(name);
    if (v === "") return fallback;
    if (["true", "True", "TRUE"].includes(v)) return true;
    if (["false", "False", "FALSE"].includes(v)) return false;
    throw new OpendrsError(`Input '${name}' must be true or false, got '${v}'`, "usage");
  };
  const token = get("github-token");
  if (!token) throw new OpendrsError("Input 'github-token' is required", "usage");
  return {
    token,
    baseConfig: bool("base-config", true),
    llmApiKey: get("llm-api-key") || undefined,
    comment: bool("comment", true),
    labels: bool("labels", true),
    sampleSalt: get("sample-salt"),
    brief: bool("brief", true),
    notifyChanges: readNotifyChanges(get("notify-changes")),
  };
}

/**
 * Reads the `notify-changes` input. `true` and `false`, its values before it took a mode, still work.
 *
 * @param value - The trimmed input; empty when it is not set.
 * @returns `every-push` when empty or `true`, `off` for `false`, or the mode as given.
 * @throws {@link OpendrsError} If the value is none of those.
 */
function readNotifyChanges(value: string): NotifyChanges {
  const normalizedValue = value.toLowerCase();
  if (normalizedValue === "" || normalizedValue === "true" || normalizedValue === "every-push") return "every-push";
  if (normalizedValue === "on-change") return "on-change";
  if (normalizedValue === "false") return "off";
  throw new OpendrsError(`Input 'notify-changes' must be every-push, on-change, true or false, got '${value}'`, "usage");
}

/** Wire the real environment into runAction, or into the sweep on a schedule / workflow_dispatch event. Returns the process exit code. */
export async function runFromEnv(env: NodeJS.ProcessEnv, write?: (s: string) => void): Promise<number> {
  const io = createWorkflowIO(env, write);
  try {
    const inputs = readInputs(env);
    if (!env.GITHUB_EVENT_PATH) throw new OpendrsError("GITHUB_EVENT_PATH is not set: run opendrs as a GitHub Action step", "usage");
    const event: unknown = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
    if (!owner || !repo) throw new OpendrsError("GITHUB_REPOSITORY is not set", "usage");
    const apiUrl = env.GITHUB_API_URL ?? "https://api.github.com";
    const client = new GitHubClient({ token: inputs.token, apiUrl, graphqlUrl: env.GITHUB_GRAPHQL_URL ?? `${apiUrl}/graphql`, owner, repo });
    const deps = { repoDir: env.GITHUB_WORKSPACE ?? process.cwd(), event, inputs, client, io, env };
    if (SWEEP_EVENTS.includes(env.GITHUB_EVENT_NAME ?? "")) await runSweep({ ...deps, owner, repo });
    else await runAction(deps);
    return 0;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    io.error(err.message);
    if ((env.RUNNER_DEBUG === "1" || env.OPENDRS_DEBUG === "1") && err.stack) io.info(err.stack);
    return 1;
  }
}
