import { CONFIG_FILE, defaultConfig, parseConfigText, type OpendrsConfig } from "../domain/config.js";
import type { ModelWeights } from "../domain/types.js";
import { OpendrsError } from "../domain/types.js";
import { gitMaybe } from "../git/exec.js";
import { parseModelWeights } from "../model/schema.js";
import type { WorkflowIO } from "./workflow.js";

// What the Action reads from the pull request's base commit, so a pull request cannot change its
// own gate: `.opendrs.yml` and the calibrated model. Shared by the full run and the fork scoring.

/**
 * Checks that a commit is in the checkout.
 *
 * @param repoDir - The checkout.
 * @param sha - The commit hash.
 * @param description - What the commit is ("Base", "Head", "Merge-base"), for the error message.
 * @throws {@link OpendrsError} If the commit is absent, which usually means a shallow clone.
 */
export async function requireCommit(repoDir: string, sha: string, description: string): Promise<void> {
  if ((await gitMaybe(repoDir, ["cat-file", "-e", `${sha}^{commit}`])) === undefined) {
    throw new OpendrsError(`${description} commit ${sha} is not in the checkout. Use actions/checkout with fetch-depth: 0.`, "git");
  }
}

/**
 * Reads `.opendrs.yml` from the base commit.
 *
 * @param repoDir - The checkout.
 * @param baseSha - The pull request's base commit.
 * @returns The parsed config, or the defaults when the base commit has no config file, and which of the two it was.
 * @throws {@link OpendrsError} If the file on the base commit is not a valid config.
 */
export async function readBaseConfig(repoDir: string, baseSha: string): Promise<{ config: OpendrsConfig; hasConfigFile: boolean }> {
  const configText = await gitMaybe(repoDir, ["show", `${baseSha}:${CONFIG_FILE}`]);
  return configText === undefined ? { config: defaultConfig(), hasConfigFile: false } : { config: parseConfigText(configText), hasConfigFile: true };
}

/**
 * Logs where the config came from, in the words the Action has always used.
 *
 * @param io - The workflow log.
 * @param baseSha - The pull request's base commit.
 * @param hasConfigFile - Whether the base commit has a config file.
 */
export function logBaseConfigSource(io: WorkflowIO, baseSha: string, hasConfigFile: boolean): void {
  io.info(hasConfigFile ? `Using ${CONFIG_FILE} from base commit ${baseSha}.` : `No ${CONFIG_FILE} on base commit ${baseSha}: using defaults.`);
}

/**
 * Reads the calibrated model (`config.model`) from the base commit.
 *
 * @param repoDir - The checkout.
 * @param baseSha - The pull request's base commit.
 * @param config - The config that names the model file.
 * @param io - The workflow log: an info line when a model is used, a warning when the file is not a valid model.
 * @returns The model, or undefined when the base commit has none or it is invalid.
 */
export async function readBaseModel(repoDir: string, baseSha: string, config: OpendrsConfig, io: WorkflowIO): Promise<ModelWeights | undefined> {
  const modelText = await gitMaybe(repoDir, ["show", `${baseSha}:${config.model}`]);
  if (modelText === undefined) return undefined;
  const parsedModel = parseModelWeights(modelText);
  if ("problem" in parsedModel) {
    io.warning(`${config.model} on the base commit is not a valid model (${parsedModel.problem}); it is ignored.`);
    return undefined;
  }
  io.info(`Using calibrated model ${config.model} from the base commit.`);
  return parsedModel.model;
}
