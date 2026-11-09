import { OpendrsError, type LlmProvider } from "../domain/types.js";
import type { OpendrsConfig } from "../domain/config.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAiProvider } from "./openai.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocal(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return LOCAL_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/** Set to "1" to allow a repo's llm.baseUrl and llm.apiKeyEnv. The Action sets it itself. */
export const TRUST_REPO_LLM_ENV = "OPENDRS_TRUST_REPO_LLM";

/**
 * Lists the LLM settings that need the user's opt-in before they can be used.
 *
 * @param baseUrl - The server URL from `.opendrs.yml`. Undefined means the provider's own API. Only an
 * exact `localhost`, `127.0.0.1` or `[::1]` host counts as local; anything else is risky.
 * @param apiKeyEnv - The name of the variable to send as the key. Undefined means the default.
 * @param defaultKeyEnv - The provider's normal key variable.
 * @returns One readable entry per risky setting, used in the error message. Empty if there are none.
 */
function untrustedSettings(baseUrl: string | undefined, apiKeyEnv: string | undefined, defaultKeyEnv: string): string[] {
  return [
    ...(baseUrl !== undefined && !isLocal(baseUrl) ? [`llm.baseUrl (${baseUrl})`] : []),
    ...(apiKeyEnv !== undefined && apiKeyEnv !== defaultKeyEnv ? [`llm.apiKeyEnv (${apiKeyEnv})`] : []),
  ];
}

/**
 * Creates the LLM provider from the config, after checking that the config may use the user's key.
 *
 * @param config - The loaded opendrs config. Outside the Action, it comes from the repository and
 * is untrusted. The Action passes `llm` settings from the base commit.
 * @param env - Where to read the API key and {@link TRUST_REPO_LLM_ENV}. Defaults to `process.env`.
 * @returns The Anthropic or OpenAI-compatible provider, or undefined when `llm.enabled` is false.
 * @throws {@link OpendrsError} With code `llm` if `llm.baseUrl` or `llm.apiKeyEnv` is refused, if
 * the key is missing (only an OpenAI-compatible server on localhost can run without one), or if
 * the `openai` provider is given a `claude-` model and no `llm.baseUrl`.
 */
export function createLlmProvider(config: OpendrsConfig, env: NodeJS.ProcessEnv = process.env): LlmProvider | undefined {
  const { enabled, provider, model, baseUrl, apiKeyEnv } = config.llm;
  if (!enabled) return undefined;

  const defaultKeyEnv = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  // Check before reading the key, so a refused config never touches the variable it named.
  const untrusted = untrustedSettings(baseUrl, apiKeyEnv, defaultKeyEnv);
  if (untrusted.length > 0 && env[TRUST_REPO_LLM_ENV] !== "1") {
    throw new OpendrsError(
      `Refusing to call the LLM: .opendrs.yml sets ${untrusted.join(" and ")}, and that file comes with the repository. ` +
        `If you trust it, set ${TRUST_REPO_LLM_ENV}=1 for this run only: while set, it applies to every repository.`,
      "llm",
    );
  }

  const keyEnv = apiKeyEnv ?? defaultKeyEnv;
  const apiKey = env[keyEnv] || undefined;
  const keyOptional = provider === "openai" && isLocal(baseUrl);
  if (!apiKey && !keyOptional) {
    throw new OpendrsError(
      `The LLM judge is enabled (llm.enabled: true, provider ${provider}) but ${keyEnv} is not set. ` +
        `Export ${keyEnv}, or set llm.enabled: false in .opendrs.yml.`,
      "llm",
    );
  }

  if (provider === "anthropic") return createAnthropicProvider({ model, apiKey: apiKey!, baseUrl });

  // llm.model defaults to a Claude id; api.openai.com would reject it with an opaque 404.
  if (!baseUrl && model.startsWith("claude-")) {
    throw new OpendrsError(
      `llm.provider is openai but llm.model is "${model}". Set llm.model to an OpenAI model, or set llm.baseUrl to a gateway that serves it.`,
      "llm",
    );
  }
  return createOpenAiProvider({ model, apiKey, baseUrl });
}
