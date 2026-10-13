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
export interface CompletionParams {
  apiKey: string;
  model: Model;
  messages: { role: "system" | "user"; content: string }[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}
export async function complete(
  params: CompletionParams,
): Promise<CompletionResult> {
  const start = performance.now();
  const data = await boundedJson(
    "https://api.deepseek.com/chat/completions",
    params.apiKey,
    {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 4096,
      thinking: { type: "disabled" },
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    },
    params.signal,
  );
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
        prompt_tokens: numberValue(
          raw.prompt_tokens,
          0,
          10000000,
          "Prompt tokens",
        ),
        completion_tokens: numberValue(
          raw.completion_tokens,
          0,
          10000000,
          "Completion tokens",
        ),
        total_tokens: numberValue(
          raw.total_tokens,
          0,
          20000000,
          "Total tokens",
        ),
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
