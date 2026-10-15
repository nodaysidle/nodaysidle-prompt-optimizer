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

    const openrouterKey =
      req.headers.get("x-openrouter-key")?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim();

    const typesafeKey =
      req.headers.get("x-typesafe-key")?.trim() ||
      process.env.TYPESAFE_API_KEY?.trim();

    const preferredEngine = req.headers.get("x-preferred-engine")?.trim();
    const requestedModel = req.headers.get("x-typesafe-model")?.trim();

    const prioritizeJev =
      preferredEngine === "jev" ||
      Boolean(req.headers.get("x-typesafe-key")?.trim()) ||
      (!openrouterKey && Boolean(typesafeKey));

    const diagnostics = await runJevDiagnostics({
      prompt: prompt.trim(),
      kind,
      typesafeKey,
      openrouterKey,
      model: requestedModel,
      preferJev: prioritizeJev,
    });

    return NextResponse.json(diagnostics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Diagnostic evaluation failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
