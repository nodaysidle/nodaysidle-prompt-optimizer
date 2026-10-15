const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface DeepSeekChatParams {
  apiKey: string;
  openrouterApiKey?: string;
  model?: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
  timeoutMs?: number;
}

async function callChatCompletion(params: {
  url: string;
  authKey: string;
  model: string;
  messages: { role: string; content: string }[];
  jsonMode?: boolean;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 20000);
  try {
    const body: Record<string, unknown> = {
      model: params.model,
      temperature: params.temperature ?? 0.3,
      messages: params.messages,
    };

    if (params.jsonMode) {
      body.response_format = { type: "json_object" };
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
      const err = new Error(msg);
      (err as any).status = res.status;
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
    throw new Error("DeepSeek API key is required.");
  }

  const openrouterKey =
    params.openrouterApiKey?.trim() ||
    (apiKey.startsWith("sk-or-") ? apiKey : undefined) ||
    process.env.OPENROUTER_API_KEY?.trim();

  // If user passed an OpenRouter key directly
  if (apiKey.startsWith("sk-or-")) {
    return callChatCompletion({
      url: OPENROUTER_API_URL,
      authKey: apiKey,
      model: params.model?.includes("/") ? params.model : "deepseek/deepseek-chat",
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      jsonMode: params.jsonMode,
      temperature: params.temperature,
      timeoutMs: params.timeoutMs,
    });
  }

  // Primary: Official DeepSeek API with 8s timeout to avoid Vercel serverless timeouts
  try {
    return await callChatCompletion({
      url: DEEPSEEK_API_URL,
      authKey: apiKey,
      model: params.model || "deepseek-chat",
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      jsonMode: params.jsonMode,
      temperature: params.temperature,
      timeoutMs: params.timeoutMs ?? 8000,
    });
  } catch (err: any) {
    // If DeepSeek official API fails for any reason and we have an OpenRouter key, fall back immediately
    if (openrouterKey) {
      console.warn(
        "DeepSeek official API failed or timed out, seamlessly falling back to DeepSeek-V3 on OpenRouter...",
        err?.message || err,
      );
      return await callChatCompletion({
        url: OPENROUTER_API_URL,
        authKey: openrouterKey,
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        jsonMode: params.jsonMode,
        temperature: params.temperature,
        timeoutMs: 25000,
      });
    }

    throw err;
  }
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
    throw new Error("DeepSeek API key is required.");
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

  if (apiKey.startsWith("sk-or-")) {
    return callChatCompletion({
      url: OPENROUTER_API_URL,
      authKey: apiKey,
      model: params.model?.includes("/") ? params.model : "deepseek/deepseek-chat",
      messages,
      temperature: 0.5,
    });
  }

  try {
    return await callChatCompletion({
      url: DEEPSEEK_API_URL,
      authKey: apiKey,
      model: params.model || "deepseek-chat",
      messages,
      temperature: 0.5,
      timeoutMs: 8000,
    });
  } catch (err: any) {
    if (openrouterKey) {
      console.warn("DeepSeek API failed for test run, falling back to OpenRouter...", err?.message || err);
      return await callChatCompletion({
        url: OPENROUTER_API_URL,
        authKey: openrouterKey,
        model: "deepseek/deepseek-chat",
        messages,
        temperature: 0.5,
        timeoutMs: 25000,
      });
    }

    throw err;
  }
}
