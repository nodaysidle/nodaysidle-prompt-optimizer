const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export interface DeepSeekChatParams {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  jsonMode?: boolean;
  temperature?: number;
}

export async function chatDeepSeek(params: DeepSeekChatParams): Promise<string> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error("DeepSeek API key is required.");
  }

  const model = params.model || "deepseek-chat";
  const body: Record<string, unknown> = {
    model,
    temperature: params.temperature ?? 0.3,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };

  if (params.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `DeepSeek error (${res.status})`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) {
        msg = `DeepSeek error: ${errJson.error.message}`;
      }
    } catch {
      msg = `DeepSeek error ${res.status}: ${errText.slice(0, 300)}`;
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek returned an empty response.");
  }

  return content;
}

/**
 * Runs a single completion test using DeepSeek for the Prompt Playground.
 */
export async function runPromptTest(params: {
  apiKey: string;
  model?: string;
  prompt: string;
  testInput?: string;
}): Promise<string> {
  const apiKey = params.apiKey.trim();
  if (!apiKey) {
    throw new Error("DeepSeek API key is required.");
  }

  const model = params.model || "deepseek-chat";
  const messages: { role: "system" | "user"; content: string }[] = [];

  if (params.testInput && params.testInput.trim()) {
    messages.push({ role: "system", content: params.prompt });
    messages.push({ role: "user", content: params.testInput.trim() });
  } else {
    messages.push({ role: "user", content: params.prompt });
  }

  const res = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Test run failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return data.choices?.[0]?.message?.content || "(No output generated)";
}
