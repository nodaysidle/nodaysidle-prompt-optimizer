import { NextRequest, NextResponse } from "next/server";
import { optimizePrompt } from "@/lib/providers/chat";
import type { DiagnosticResult, PromptKind } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, kind, model, existingDiagnostics } = body as {
      prompt: string;
      kind: PromptKind;
      model?: string;
      existingDiagnostics?: DiagnosticResult;
    };

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    // Key can come from user client header or server environment variable
    const deepseekKey =
      req.headers.get("x-deepseek-key")?.trim() ||
      process.env.DEEPSEEK_API_KEY?.trim();

    if (!deepseekKey) {
      return NextResponse.json(
        {
          error:
            "DeepSeek API key is required. Add it in Settings or configure DEEPSEEK_API_KEY on the server.",
        },
        { status: 401 },
      );
    }

    const typesafeKey =
      req.headers.get("x-typesafe-key")?.trim() ||
      process.env.TYPESAFE_API_KEY?.trim();

    const result = await optimizePrompt({
      prompt: prompt.trim(),
      kind: kind || "user",
      deepseekApiKey: deepseekKey,
      deepseekModel: model || "deepseek-chat",
      typesafeApiKey: typesafeKey,
      existingDiagnostics,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Optimization failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
