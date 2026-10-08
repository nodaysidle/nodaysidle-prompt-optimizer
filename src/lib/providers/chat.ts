import {
  IDENTITY_LOCK_OUTPUT,
  buildOptimizerMessages,
  enforceIdentityLock,
  isOnlySubjectPrompt,
  isSubjectInPhotoPrompt,
  parseOptimizationResponse,
} from "../optimizer-prompt";
import type { DiagnosticResult, EngineTarget, OptimizationResult, PromptKind } from "../types";
import { chatDeepSeek } from "./deepseek";
import { runJevDiagnostics, runJevQualityGate } from "../jev";

export interface OptimizeParams {
  prompt: string;
  kind: PromptKind;
  engineTarget?: EngineTarget;
  deepseekApiKey: string;
  deepseekModel?: string;
  typesafeApiKey?: string;
  existingDiagnostics?: DiagnosticResult;
}

export async function optimizePrompt(params: OptimizeParams): Promise<OptimizationResult> {
  const isImageOrVideo = params.kind === "image" || params.kind === "video";
  const hasSubjectPrefix = isImageOrVideo && isSubjectInPhotoPrompt(params.prompt);
  const isOnlySubject = hasSubjectPrefix && isOnlySubjectPrompt(params.prompt);

  // If prompt is only the subject reference, return deterministic identity lock output immediately
  if (isOnlySubject) {
    return {
      optimized: IDENTITY_LOCK_OUTPUT,
      negativePrompt:
        "identity mismatch, facial morphing, different person, distorted features, bad likeness",
      summary:
        "Applied reference photo identity lock rule: exact likeness and facial geometry locked to attached reference photo.",
      changes: [
        "Locked subject identity to attached reference photo",
        "Enforced exact facial geometry and proportions preservation",
      ],
      diagnostics: params.existingDiagnostics,
    };
  }

  // Step 1: Run diagnostics if not already provided
  const diagnostics =
    params.existingDiagnostics ||
    (await runJevDiagnostics({
      prompt: params.prompt,
      kind: params.kind,
      apiKey: params.typesafeApiKey,
    }));

  // Step 2: Build diagnostic-conditioned rewriter messages
  const { system, user } = buildOptimizerMessages(
    params.prompt,
    params.kind,
    diagnostics,
    params.engineTarget,
  );

  // Step 3: Execute rewrite with DeepSeek platform API
  const raw = await chatDeepSeek({
    apiKey: params.deepseekApiKey,
    model: params.deepseekModel || "deepseek-chat",
    system,
    user,
    jsonMode: true,
  });

  const parsed = parseOptimizationResponse(raw, params.kind, params.prompt);

  // Step 4: Deterministically enforce identity lock rule for image and video
  if (hasSubjectPrefix) {
    parsed.optimized = enforceIdentityLock(parsed.optimized, params.kind);
    if (!parsed.changes.some((c) => /identity lock|likeness|facial geometry/i.test(c))) {
      parsed.changes.unshift(
        "Enforced reference photo identity lock (exact likeness, facial geometry / proportions)",
      );
    }
  }

  // Step 5: Quality Gate evaluation via Jev (if typesafeApiKey available)
  let qualityGate = undefined;
  if (params.typesafeApiKey?.trim() || process.env.TYPESAFE_API_KEY) {
    qualityGate = await runJevQualityGate({
      original: params.prompt,
      optimized: parsed.optimized,
      apiKey: params.typesafeApiKey,
    });
  }

  return {
    optimized: parsed.optimized,
    negativePrompt: parsed.negativePrompt,
    summary: parsed.summary,
    changes: parsed.changes,
    diagnostics,
    qualityGate,
  };
}
