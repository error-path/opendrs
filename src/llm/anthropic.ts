import { OpendrsError, type LlmProvider } from "../domain/types.js";
import { postJson } from "./http.js";
import { parseJudgement } from "./parse.js";
import { buildMessages } from "./prompt.js";
import { JUDGEMENT_SCHEMA } from "./schema.js";
import { VERIFY_SCHEMA, buildVerifyMessages, parseVerification } from "./verify.js";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";
/** The per-hunk verdict array grows with the diff, so this must stay well above a large PR's reply. */
const MAX_TOKENS = 32_000;
/** One short verdict per candidate; the candidate list is capped by llm.verify.maxTokens upstream. */
const VERIFY_MAX_TOKENS = 8_000;

// Models up to Opus 4.6 / Sonnet 4.6 / Haiku 4.5 accept `temperature`. Opus 4.7+, Sonnet 5 and later
// reject non-default sampling parameters with a 400, so those get a low effort setting instead.
const ACCEPTS_TEMPERATURE = /claude-(?:3[\w.-]*|(?:opus|sonnet|haiku)-4(?:-[0-6])?(?:[-@]\d{8})?)$/;
// Structured outputs (`output_config.format`) exist from Opus 4.1 / Haiku 4.5 / Sonnet 4.5 on; Claude 3.x and
// the 4.0 models reject the parameter, so they rely on the prompt alone.
const LACKS_STRUCTURED_OUTPUTS = /claude-(?:3[\w.-]*|(?:opus|sonnet|haiku)-4(?:-0)?(?:[-@]\d{8})?)$/;

interface MessagesResponse {
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Creates the provider that calls the Anthropic Messages API, or a server that speaks it.
 *
 * @param opts - The model, the API key and the server URL (default: api.anthropic.com). Without
 *   a key, the request has no `x-api-key` header; only a local server is called that way.
 * @returns The provider for the judge and the verification pass.
 */
export function createAnthropicProvider(opts: { model: string; apiKey?: string; baseUrl?: string }): LlmProvider {
  const url = `${(opts.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, "")}/v1/messages`;
  const auth: Record<string, string> = opts.apiKey ? { "x-api-key": opts.apiKey } : {};
  const samplingFor = (schema: unknown) => {
    const outputConfig = {
      ...(ACCEPTS_TEMPERATURE.test(opts.model) ? {} : { effort: "low" }),
      ...(LACKS_STRUCTURED_OUTPUTS.test(opts.model) ? {} : { format: { type: "json_schema", schema } }),
    };
    return {
      ...(ACCEPTS_TEMPERATURE.test(opts.model) ? { temperature: 0 } : {}),
      ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    };
  };
  const sampling = samplingFor(JUDGEMENT_SCHEMA);
  const verifySampling = samplingFor(VERIFY_SCHEMA);

  const post = (system: string, user: string, maxTokens: number, sampling: Record<string, unknown>) =>
    postJson(
      "Anthropic API",
      url,
      { ...auth, "anthropic-version": API_VERSION },
      { model: opts.model, max_tokens: maxTokens, ...sampling, system, messages: [{ role: "user", content: user }] },
      opts.apiKey,
    ) as Promise<MessagesResponse>;

  const textOf = (res: MessagesResponse) =>
    (res.content ?? [])
      .filter((contentBlock) => contentBlock.type === "text")
      .map((contentBlock) => contentBlock.text ?? "")
      .join("");

  return {
    name: "anthropic",
    async judge(input) {
      const { system, user } = buildMessages(input);
      const res = await post(system, user, MAX_TOKENS, sampling);

      if (res.stop_reason === "refusal") throw new OpendrsError("Anthropic API refused to judge this diff", "llm");
      if (res.stop_reason === "max_tokens") {
        throw new OpendrsError(`LLM reply was cut off at max_tokens (${MAX_TOKENS}); the diff has too many hunks to classify in one reply`, "llm");
      }
      return parseJudgement(textOf(res), input.files, input.hunks, input.truncated);
    },
    async verify(input) {
      const { system, user } = buildVerifyMessages(input);
      const res = await post(system, user, VERIFY_MAX_TOKENS, verifySampling);

      if (res.stop_reason === "refusal") throw new OpendrsError("Anthropic API refused to verify this brief", "llm");
      if (res.stop_reason === "max_tokens") {
        throw new OpendrsError(`LLM reply was cut off at max_tokens (${VERIFY_MAX_TOKENS}); too many candidates to verify in one reply`, "llm");
      }
      const files = [...new Set(input.candidates.map((candidate) => candidate.file))];
      return {
        verdicts: parseVerification(textOf(res), input.candidates, files),
        usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 },
      };
    },
  };
}
