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

/** Set to "1" by the person running opendrs (or by the Action, whose llm section comes from the base commit). */
export const TRUST_REPO_LLM_ENV = "OPENDRS_TRUST_REPO_LLM";

/**
 * Settings that decide where the key goes or which variable is sent as the key. `.opendrs.yml` comes
 * with the repository, so a cloned repo must not be able to choose them on its own.
 */
function untrustedSettings(baseUrl: string | undefined, apiKeyEnv: string | undefined, defaultKeyEnv: string): string[] {
  return [
    ...(baseUrl !== undefined && !isLocal(baseUrl) ? [`llm.baseUrl (${baseUrl})`] : []),
    ...(apiKeyEnv !== undefined && apiKeyEnv !== defaultKeyEnv ? [`llm.apiKeyEnv (${apiKeyEnv})`] : []),
  ];
}

/**
 * Returns undefined when llm.enabled is false. Throws OpendrsError("llm") when enabled but no API key,
 * or when the config picks a remote endpoint or a custom key variable without TRUST_REPO_LLM_ENV.
 */
export function createLlmProvider(config: OpendrsConfig, env: NodeJS.ProcessEnv = process.env): LlmProvider | undefined {
  const { enabled, provider, model, baseUrl, apiKeyEnv } = config.llm;
  if (!enabled) return undefined;

  const defaultKeyEnv = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
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
