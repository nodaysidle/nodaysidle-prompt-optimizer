import { buildOptimizerMessages, enforceIdentityLock, isSubjectInPhotoPrompt, parseOptimizationResponse, preservationWarnings } from "../optimizer-prompt";
import type { DiagnosticSource, EngineTarget, Model, OptimizationMode, OptimizationResult, PromptKind } from "../types";
import { chatDeepSeek } from "./deepseek";
import { runJevDiagnostics, runJevQualityGate } from "../jev";
import { ProviderError } from "./completion";

export async function optimizePrompt(params: { prompt: string; kind: PromptKind; engineTarget: EngineTarget; mode: OptimizationMode; deepseekApiKey: string; model: Model; diagnosticSource: DiagnosticSource; diagnosticKey?: string; allowLocalFallback: boolean; signal?: AbortSignal }): Promise<OptimizationResult> {
  const diagnostics = await runJevDiagnostics({ prompt: params.prompt, kind: params.kind, source: params.diagnosticSource, apiKey: params.diagnosticKey, allowLocalFallback: params.allowLocalFallback, signal: params.signal });
  const messages = buildOptimizerMessages(params.prompt, params.kind, diagnostics, params.engineTarget, params.mode);
  const { content, ...completion } = await chatDeepSeek({ ...messages, apiKey: params.deepseekApiKey, model: params.model, jsonMode: true, signal: params.signal });
  const parsed = parseOptimizationResponse(content, params.engineTarget);
  if ((parsed.optimized.match(/\[[^\]]+\]/g) || []).some((bracket) => !params.prompt.includes(bracket))) {
    throw new ProviderError("Rewrite introduced new bracket variables or tags. Candidate rejected; retry without generated placeholders.");
  }
  if (isSubjectInPhotoPrompt(params.prompt) && (params.kind === "image" || params.kind === "video")) parsed.optimized = enforceIdentityLock(parsed.optimized);
  const warnings = preservationWarnings(params.prompt, parsed.optimized, params.mode);
  if (params.mode !== "creative" && parsed.assumptions.length) warnings.push("The evaluator returned assumptions outside creative mode. Review these additions.");
  const qualityGate = await runJevQualityGate({ original: params.prompt, optimized: parsed.optimized, mode: params.mode, kind: params.kind, source: params.diagnosticSource, apiKey: params.diagnosticKey, signal: params.signal });
  if (warnings.length) { qualityGate.state = "needsReview"; qualityGate.passed = false; qualityGate.reason = "Local preservation checks flagged changes. " + qualityGate.reason; }
  return { ...parsed, warnings, diagnostics, qualityGate, completion };
}
