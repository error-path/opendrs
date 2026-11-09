import { OpendrsError } from "../domain/types.js";

const TIMEOUT_MS = 60_000;
const MAX_RETRY_DELAY_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;

/** retry-after is either delta-seconds or an HTTP date. */
function retryDelayMs(header: string | null): number {
  if (header === null) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  if (Number.isNaN(ms)) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, ms));
}

/** Both Anthropic and OpenAI-style APIs return {"error": {"message": ...}}. */
function apiMessage(text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string") return message;
  } catch {
    // not JSON: fall through to the raw body
  }
  return text.slice(0, 300);
}

async function attempt(label: string, url: string, init: RequestInit): Promise<{ res: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
    return { res, text: await res.text() };
  } catch (e) {
    if (controller.signal.aborted) throw new OpendrsError(`${label} request timed out after ${TIMEOUT_MS / 1000} s`, "llm");
    throw new OpendrsError(`${label} request failed: ${(e as Error).message}`, "llm");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST JSON with a 60 s timeout per attempt and one retry on 429/5xx.
 * `secret` is scrubbed from every error message, in case an API echoes the key back.
 */
export async function postJson(label: string, url: string, headers: Record<string, string>, body: unknown, secret?: string): Promise<unknown> {
  const redact = (e: OpendrsError) =>
    secret ? new OpendrsError(e.message.replaceAll(secret, "[redacted]"), "llm") : e;
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) };

  for (let tries = 0; ; tries++) {
    let res: Response;
    let text: string;
    try {
      ({ res, text } = await attempt(label, url, init));
    } catch (e) {
      throw redact(e as OpendrsError);
    }
    if (res.ok) {
      try {
        return JSON.parse(text);
      } catch {
        throw new OpendrsError(`${label} returned a non-JSON response (HTTP ${res.status})`, "llm");
      }
    }
    if ((res.status === 429 || res.status >= 500) && tries === 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res.headers.get("retry-after"))));
      continue;
    }
    throw redact(new OpendrsError(`${label} request failed: HTTP ${res.status}: ${apiMessage(text)}`, "llm"));
  }
}
