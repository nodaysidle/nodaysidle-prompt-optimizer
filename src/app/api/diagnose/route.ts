import { NextRequest, NextResponse } from "next/server";
import { runDiagnostics } from "@/lib/decisions";
import type { PromptKind } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, kind } = body as {
      prompt: string;
      kind?: PromptKind;
    };

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const openrouterKey =
      req.headers.get("x-openrouter-key")?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim();

    const diagnostics = await runDiagnostics({
      prompt: prompt.trim(),
      kind,
      openrouterKey,
    });

    return NextResponse.json(diagnostics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Diagnostic evaluation failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
