import { NextRequest, NextResponse } from "next/server";
import { runJevDiagnostics } from "@/lib/jev";
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

    const typesafeKey =
      req.headers.get("x-typesafe-key")?.trim() ||
      process.env.TYPESAFE_API_KEY?.trim();

    const diagnostics = await runJevDiagnostics({
      prompt: prompt.trim(),
      kind,
      apiKey: typesafeKey,
    });

    return NextResponse.json(diagnostics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Diagnostic evaluation failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
