import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/domain/config.js";
import { OpendrsError } from "../../src/domain/types.js";
import { createLlmProvider } from "../../src/llm/provider.js";

const config = (llm: Record<string, unknown>) => parseConfig({ llm });

function errorOf(fn: () => unknown): OpendrsError {
  try {
    fn();
  } catch (e) {
    return e as OpendrsError;
  }
  throw new Error("expected a throw");
}

describe("createLlmProvider", () => {
  it("returns undefined when the judge is disabled, even without a key", () => {
    expect(createLlmProvider(config({}), {})).toBeUndefined();
  });

  it("builds the Anthropic provider from ANTHROPIC_API_KEY", () => {
    expect(createLlmProvider(config({ enabled: true }), { ANTHROPIC_API_KEY: "k" })?.name).toBe("anthropic");
  });

  it("reads the key from llm.apiKeyEnv when set", () => {
    const cfg = config({ enabled: true, apiKeyEnv: "MY_KEY" });
    expect(createLlmProvider(cfg, { MY_KEY: "k", OPENDRS_TRUST_REPO_LLM: "1" })?.name).toBe("anthropic");
    expect(() => createLlmProvider(cfg, { ANTHROPIC_API_KEY: "k", OPENDRS_TRUST_REPO_LLM: "1" })).toThrow(/MY_KEY/);
  });

  describe("settings that come with the repository", () => {
    const refused = /Refusing to call the LLM/;

    it("refuses a remote baseUrl chosen by the repo, even with the default key", () => {
      const cfg = config({ enabled: true, provider: "openai", model: "x", baseUrl: "https://attacker.example" });
      expect(() => createLlmProvider(cfg, { OPENAI_API_KEY: "k" })).toThrow(refused);
    });

    it("refuses a custom apiKeyEnv chosen by the repo, before reading the variable", () => {
      const cfg = config({ enabled: true, apiKeyEnv: "GITHUB_TOKEN" });
      expect(() => createLlmProvider(cfg, { GITHUB_TOKEN: "secret" })).toThrow(refused);
    });

    it.each(["localhost.attacker.example", "localhost@attacker.example"])("treats %s as remote", (host) => {
      const cfg = config({ enabled: true, provider: "openai", model: "x", baseUrl: `http://${host}/v1` });
      expect(() => createLlmProvider(cfg, { OPENAI_API_KEY: "k" })).toThrow(refused);
    });

    it("only the exact value 1 opts in", () => {
      const cfg = config({ enabled: true, apiKeyEnv: "MY_KEY" });
      expect(() => createLlmProvider(cfg, { MY_KEY: "k", OPENDRS_TRUST_REPO_LLM: "true" })).toThrow(refused);
    });

    it("allows the opted-in remote endpoint", () => {
      const cfg = config({ enabled: true, provider: "openai", model: "x", baseUrl: "https://gw.example.com/v1", apiKeyEnv: "GW_KEY" });
      expect(createLlmProvider(cfg, { GW_KEY: "k", OPENDRS_TRUST_REPO_LLM: "1" })?.name).toBe("openai");
    });

    it("does not need opting in when apiKeyEnv just names the provider's default", () => {
      const cfg = config({ enabled: true, apiKeyEnv: "ANTHROPIC_API_KEY" });
      expect(createLlmProvider(cfg, { ANTHROPIC_API_KEY: "k" })?.name).toBe("anthropic");
    });
  });

  it("throws an actionable llm error when enabled but the key is missing", () => {
    const err = errorOf(() => createLlmProvider(config({ enabled: true }), { ANTHROPIC_API_KEY: "" }));
    expect(err).toBeInstanceOf(OpendrsError);
    expect(err.code).toBe("llm");
    expect(err.message).toContain("ANTHROPIC_API_KEY");
    expect(err.message).toMatch(/llm\.enabled/);
  });

  it("builds the OpenAI-compatible provider from OPENAI_API_KEY", () => {
    const cfg = config({ enabled: true, provider: "openai", model: "gpt-x" });
    expect(createLlmProvider(cfg, { OPENAI_API_KEY: "k" })?.name).toBe("openai");
    expect(() => createLlmProvider(cfg, {})).toThrow(/OPENAI_API_KEY/);
  });

  it.each(["http://localhost:11434/v1", "http://127.0.0.1:8000/v1", "http://[::1]:8000/v1"])(
    "does not require a key for a local OpenAI-compatible server at %s",
    (baseUrl) => {
      const cfg = config({ enabled: true, provider: "openai", model: "llama3", baseUrl });
      expect(createLlmProvider(cfg, {})?.name).toBe("openai");
    },
  );

  it("refuses to send a Claude model id to api.openai.com", () => {
    const err = errorOf(() => createLlmProvider(config({ enabled: true, provider: "openai" }), { OPENAI_API_KEY: "k" }));
    expect(err.code).toBe("llm");
    expect(err.message).toMatch(/llm\.model/);
  });
});
