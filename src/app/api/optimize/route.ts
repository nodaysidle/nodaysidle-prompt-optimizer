import { NextRequest, NextResponse } from "next/server";
import { optimizePrompt } from "@/lib/providers/chat";
import {
  IDENTITY_LOCK_OUTPUT,
  isOnlySubjectPrompt,
  isSubjectInPhotoPrompt,
} from "@/lib/optimizer-prompt";
import type { DiagnosticResult, EngineTarget, PromptKind } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, kind, model, engineTarget, existingDiagnostics } = body as {
      prompt: string;
      kind: PromptKind;
      model?: string;
      engineTarget?: EngineTarget;
      existingDiagnostics?: DiagnosticResult;
    };

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required." },
        { status: 400 },
      );
    }

    const trimmedPrompt = prompt.trim();
    const effectiveKind = kind || "user";
    const isImageOrVideo = effectiveKind === "image" || effectiveKind === "video";

    // Immediate resolution when prompt is only the subject reference
    if (isImageOrVideo && isSubjectInPhotoPrompt(trimmedPrompt) && isOnlySubjectPrompt(trimmedPrompt)) {
      return NextResponse.json({
        optimized: IDENTITY_LOCK_OUTPUT,
        negativePrompt:
          "identity mismatch, facial morphing, different person, distorted features, bad likeness",
        summary:
          "Applied reference photo identity lock rule: exact likeness and facial geometry locked to attached reference photo.",
        changes: [
          "Locked subject identity to attached reference photo",
          "Enforced exact facial geometry and proportions preservation",
        ],
        diagnostics: existingDiagnostics,
      });
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
      kind: effectiveKind,
      engineTarget,
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
