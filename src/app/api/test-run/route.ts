import { NextRequest, NextResponse } from "next/server";
import { runPromptTest } from "@/lib/providers/deepseek";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, testInput, model } = body as {
      prompt: string;
      testInput?: string;
      model?: string;
    };

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const deepseekKey =
      req.headers.get("x-deepseek-key")?.trim() ||
      process.env.DEEPSEEK_API_KEY?.trim();

    const openrouterKey =
      req.headers.get("x-openrouter-key")?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim();

    const effectiveKey = deepseekKey || openrouterKey;

    if (!effectiveKey) {
      return NextResponse.json(
        {
          error:
            "DeepSeek API key or OpenRouter API key is required. Add it in Settings or configure on the server.",
        },
        { status: 401 },
      );
    }

    const output = await runPromptTest({
      apiKey: deepseekKey || openrouterKey!,
      openrouterApiKey: openrouterKey,
      model: model || "deepseek-chat",
      prompt: prompt.trim(),
      testInput,
    });

    return NextResponse.json({ output });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Test run failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
