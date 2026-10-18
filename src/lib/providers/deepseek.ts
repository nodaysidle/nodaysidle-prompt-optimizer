const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export const DEFAULT_MODEL = "deepseek-v4.1-flash";

/**
 * Maps the model chosen in Settings to the id each provider expects.
 * Older saved choices (deepseek-chat, deepseek-reasoner) map to their V4 successors.
 */
export function resolveModels(model?: string): { openrouter: string; direct: string } {
  const m = (model || DEFAULT_MODEL).trim();
  if (m.includes("/")) return { openrouter: m, direct: "deepseek-flash" };
  if (/^(deepseek-reasoner|deepseek-v4-pro)$/.test(m)) {
    return { openrouter: "deepseek/deepseek-v4-pro", direct: "deepseek-v4-pro" };
  }
  if (/^(deepseek-chat|deepseek-flash|deepseek-v4\.1-flash)$/.test(m)) {
    return { openrouter: "deepseek/deepseek-v4.1-flash", direct: "deepseek-flash" };
  }
  return { openrouter: `deepseek/${m}`, direct: m };
}

export interface DeepSeekChatParams {
  apiKey: string;
  openrouterApiKey?: string;
  model?: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}

async function callChatCompletion(params: {
  url: string;
  authKey: string;
  model: string;
  messages: { role: string; content: string }[];
  jsonMode?: boolean;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 15000);
  try {
    const body: Record<string, unknown> = {
      model: params.model,
      temperature: params.temperature ?? 0.3,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 2048,
    };

    if (params.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    if (params.url.includes("openrouter.ai")) {
      body.provider = { sort: "latency", allow_fallbacks: true };
    }

    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.authKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `API error (${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) {
          msg = `API error (${res.status}): ${errJson.error.message}`;
        }
      } catch {
        msg = `API error (${res.status}): ${errText.slice(0, 300)}`;
      }
      const err = new Error(msg) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Provider returned an empty response.");
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatDeepSeek(params: DeepSeekChatParams): Promise<string> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const openrouterKey =
    params.openrouterApiKey?.trim() ||
    (apiKey.startsWith("sk-or-") ? apiKey : undefined) ||
    process.env.OPENROUTER_API_KEY?.trim();

  const models = resolveModels(params.model);
  // long rewrites need more time than the old fixed 15 s / 10 s
  const timeoutMs = params.timeoutMs ?? 15000 + Math.round((params.maxTokens ?? 2048) * 12);

  // When OpenRouter key is available (either client key or server env), prioritize it for instant ~1.2s execution
  if (openrouterKey) {
    try {
      return await callChatCompletion({
        url: OPENROUTER_API_URL,
        authKey: openrouterKey,
        model: models.openrouter,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        jsonMode: params.jsonMode,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        timeoutMs,
      });
    } catch (openRouterErr) {
      console.warn("OpenRouter request failed, falling back to direct DeepSeek API:", openRouterErr);
      if (!apiKey.startsWith("sk-or-")) {
        return await callChatCompletion({
          url: DEEPSEEK_API_URL,
          authKey: apiKey,
          model: models.direct,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          jsonMode: params.jsonMode,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          timeoutMs,
        });
      }
      throw openRouterErr;
    }
  }

  // Fallback if no OpenRouter key exists: use official DeepSeek API directly
  return await callChatCompletion({
    url: DEEPSEEK_API_URL,
    authKey: apiKey,
    model: models.direct,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    jsonMode: params.jsonMode,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    timeoutMs,
  });
}

/**
 * Runs a single completion test using DeepSeek for the Prompt Playground.
 */
export async function runPromptTest(params: {
  apiKey: string;
  openrouterApiKey?: string;
  model?: string;
  prompt: string;
  testInput?: string;
}): Promise<string> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const openrouterKey =
    params.openrouterApiKey?.trim() ||
    (apiKey.startsWith("sk-or-") ? apiKey : undefined) ||
    process.env.OPENROUTER_API_KEY?.trim();

  const messages: { role: string; content: string }[] = [];
  if (params.testInput && params.testInput.trim()) {
    messages.push({ role: "system", content: params.prompt });
    messages.push({ role: "user", content: params.testInput.trim() });
  } else {
    messages.push({ role: "user", content: params.prompt });
  }

  const models = resolveModels(params.model);

  if (openrouterKey) {
    try {
      return await callChatCompletion({
        url: OPENROUTER_API_URL,
        authKey: openrouterKey,
        model: models.openrouter,
        messages,
        temperature: 0.5,
        timeoutMs: 45000,
      });
    } catch (err) {
      console.warn("OpenRouter test-run failed, falling back to official DeepSeek:", err);
      if (!apiKey.startsWith("sk-or-")) {
        return await callChatCompletion({
          url: DEEPSEEK_API_URL,
          authKey: apiKey,
          model: models.direct,
          messages,
          temperature: 0.5,
          timeoutMs: 45000,
        });
      }
      throw err;
    }
  }

  return await callChatCompletion({
    url: DEEPSEEK_API_URL,
    authKey: apiKey,
    model: models.direct,
    messages,
    temperature: 0.5,
    timeoutMs: 45000,
  });
}
