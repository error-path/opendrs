import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("a local baseUrl chosen by the repository", () => {
    const judgeInput = { diff: "d", files: [], hunks: [], truncated: false };
    const judgementText = '{"risk":0.1,"confidence":5,"rationale":"r","hunks":[],"risky_snippets":[]}';
    const anthropicReply = { stop_reason: "end_turn", content: [{ type: "text", text: judgementText }] };
    const openAiReply = { choices: [{ message: { content: judgementText } }] };

    afterEach(() => vi.unstubAllGlobals());

    /**
     * Runs one judge call through a fake fetch and returns the headers it sent.
     *
     * @param llm - The `llm` section of the config, on top of `enabled: true`.
     * @param env - The environment the provider reads the key and the opt-in from.
     * @param reply - The JSON body the fake server answers with.
     * @returns The request headers of the single call.
     */
    async function sentHeaders(llm: Record<string, unknown>, env: NodeJS.ProcessEnv, reply: unknown): Promise<Record<string, string>> {
      const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => Response.json(reply));
      vi.stubGlobal("fetch", fetchMock);
      await createLlmProvider(config({ enabled: true, ...llm }), env)!.judge(judgeInput);
      return fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    }

    it("sends no Anthropic key to a local port without the opt-in", async () => {
      const headers = await sentHeaders({ baseUrl: "http://localhost:9999" }, { ANTHROPIC_API_KEY: "secret" }, anthropicReply);
      expect(headers["x-api-key"]).toBeUndefined();
    });

    it("sends no OpenAI key to a local port without the opt-in", async () => {
      const llm = { provider: "openai", model: "llama3", baseUrl: "http://127.0.0.1:11434/v1" };
      const headers = await sentHeaders(llm, { OPENAI_API_KEY: "secret" }, openAiReply);
      expect(headers.authorization).toBeUndefined();
    });

    it("sends the key to a local port with the opt-in", async () => {
      const anthropicEnv = { ANTHROPIC_API_KEY: "secret", OPENDRS_TRUST_REPO_LLM: "1" };
      expect((await sentHeaders({ baseUrl: "http://localhost:9999" }, anthropicEnv, anthropicReply))["x-api-key"]).toBe("secret");
      const llm = { provider: "openai", model: "llama3", baseUrl: "http://[::1]:8000/v1" };
      const openAiEnv = { OPENAI_API_KEY: "secret", OPENDRS_TRUST_REPO_LLM: "1" };
      expect((await sentHeaders(llm, openAiEnv, openAiReply)).authorization).toBe("Bearer secret");
    });

    it("does not require a key for a local Anthropic-compatible server without the opt-in", () => {
      expect(createLlmProvider(config({ enabled: true, baseUrl: "http://localhost:9999" }), {})?.name).toBe("anthropic");
    });
  });

  it("refuses to send a Claude model id to api.openai.com", () => {
    const err = errorOf(() => createLlmProvider(config({ enabled: true, provider: "openai" }), { OPENAI_API_KEY: "k" }));
    expect(err.code).toBe("llm");
    expect(err.message).toMatch(/llm\.model/);
  });
});
