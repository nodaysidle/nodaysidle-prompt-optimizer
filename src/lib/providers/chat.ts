import { buildOptimizerMessages, parseOptimizationResponse } from "../optimizer-prompt";
import type { DiagnosticResult, OptimizationResult, PromptKind } from "../types";
import { chatDeepSeek } from "./deepseek";
import { runJevDiagnostics, runJevQualityGate } from "../jev";

export interface OptimizeParams {
  prompt: string;
  kind: PromptKind;
  deepseekApiKey: string;
  deepseekModel?: string;
  typesafeApiKey?: string;
  existingDiagnostics?: DiagnosticResult;
}

export async function optimizePrompt(params: OptimizeParams): Promise<OptimizationResult> {
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
  );

  // Step 3: Execute rewrite with DeepSeek platform API
  const raw = await chatDeepSeek({
    apiKey: params.deepseekApiKey,
    model: params.deepseekModel || "deepseek-chat",
    system,
    user,
    jsonMode: true,
  });

  const parsed = parseOptimizationResponse(raw);

  // Step 4: Quality Gate evaluation via Jev (if typesafeApiKey available)
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
    summary: parsed.summary,
    changes: parsed.changes,
    diagnostics,
    qualityGate,
  };
}
