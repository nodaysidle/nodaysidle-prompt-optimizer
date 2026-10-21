import { numberValue, record, text } from "../validation";
import type { CompletionResult, Model } from "../types";

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export async function boundedJson(
  url: string,
  apiKey: string,
  body: unknown,
  parent?: AbortSignal,
  timeout = 20000,
  maxBytes = 300000,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(
        `Provider request failed (${response.status}). Check access, quota and model configuration.`,
      );
    }
    if (!response.body)
      throw new ProviderError("Provider returned no response body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ProviderError(
            "Provider response exceeded the output limit.",
          );
        }
        result += decoder.decode(value, { stream: true });
      }
      result += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(result);
  } catch (error) {
    if (controller.signal.aborted)
      throw new ProviderError(
        parent?.aborted
          ? "Request cancelled."
          : "Provider deadline exceeded. Retry with a shorter prompt.",
        504,
      );
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "Provider returned an invalid response or could not be reached.",
    );
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Ids per route. Anything outside this table never reaches a provider. */
export const MODEL_IDS: Record<Model, { openrouter: string; direct: string }> = {
  "deepseek-v4.1-flash": {
    openrouter: "deepseek/deepseek-v4.1-flash",
    direct: "deepseek-flash",
  },
  "deepseek-v4-pro": {
    openrouter: "deepseek/deepseek-v4-pro",
    direct: "deepseek-v4-pro",
  },
};

export interface CompletionParams {
  /** A DeepSeek key, or an OpenRouter key (sk-or-...) when that is all the caller has. */
  apiKey: string;
  openrouterApiKey?: string;
  model: Model;
  messages: { role: "system" | "user"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

function splitKeys(params: CompletionParams) {
  const apiKey = params.apiKey.trim();
  const viaOpenrouter = apiKey.startsWith("sk-or-");
  return {
    openrouter: params.openrouterApiKey?.trim() || (viaOpenrouter ? apiKey : ""),
    direct: viaOpenrouter ? "" : apiKey,
  };
}

function isCancelled(error: unknown, signal?: AbortSignal) {
  return Boolean(signal?.aborted) || (error instanceof ProviderError && error.status === 499);
}

async function request(
  route: "openrouter" | "direct",
  key: string,
  params: CompletionParams,
  timeout: number,
) {
  const ids = MODEL_IDS[params.model];
  const body = {
    model: route === "openrouter" ? ids.openrouter : ids.direct,
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? 4096,
    ...(route === "direct" ? { thinking: { type: "disabled" } } : {}),
    // The fastest healthy upstream, not the cheapest; the rewrite sits on the user's critical path.
    ...(route === "openrouter"
      ? { provider: { sort: "latency", allow_fallbacks: true } }
      : {}),
    ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };
  return boundedJson(
    route === "openrouter" ? OPENROUTER_URL : DEEPSEEK_URL,
    key,
    body,
    params.signal,
    timeout,
  );
}

export async function complete(
  params: CompletionParams,
): Promise<CompletionResult> {
  const start = performance.now();
  const keys = splitKeys(params);
  if (!keys.openrouter && !keys.direct)
    throw new ProviderError("A provider key is required.", 401);
  // Long rewrites need more time than a fixed deadline, but never an unbounded one.
  const timeout = Math.min(90000, 15000 + (params.maxTokens ?? 4096) * 12);

  let data: unknown;
  if (keys.openrouter) {
    try {
      data = await request("openrouter", keys.openrouter, params, timeout);
    } catch (error) {
      if (!keys.direct || isCancelled(error, params.signal)) throw error;
      data = await request("direct", keys.direct, params, timeout);
    }
  } else {
    data = await request("direct", keys.direct, params, timeout);
  }
  return parseCompletion(data, start);
}

function parseCompletion(data: unknown, start: number): CompletionResult {
  try {
    const result = record(data);
    if (!Array.isArray(result.choices) || !result.choices.length)
      throw new Error();
    const choice = record(result.choices[0]);
    if (choice.finish_reason !== "stop")
      throw new ProviderError(
        "Provider did not complete the response. It may be truncated, filtered or aborted. Shorten the prompt or increase the allowed output limit.",
      );
    const content = text(
      record(choice.message).content,
      "Completion",
      true,
      40000,
    );
    let usage: CompletionResult["usage"];
    if (result.usage !== undefined) {
      const raw = record(result.usage);
      usage = {
        prompt_tokens: numberValue(raw.prompt_tokens, 0, 10000000, "Prompt tokens"),
        completion_tokens: numberValue(raw.completion_tokens, 0, 10000000, "Completion tokens"),
        total_tokens: numberValue(raw.total_tokens, 0, 20000000, "Total tokens"),
      };
      if (Object.values(usage).some((value) => !Number.isInteger(value)))
        throw new Error();
    }
    return {
      content,
      model: text(result.model, "Returned model", true, 200),
      elapsedMs: Math.round(performance.now() - start),
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("Provider response failed schema validation.");
  }
}
