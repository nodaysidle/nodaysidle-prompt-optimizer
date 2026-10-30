import {
  IDENTITY_LOCK_OUTPUT,
  buildOptimizerMessages,
  buildRepairMessages,
  enforceIdentityLock,
  findFabricatedPlaceholders,
  findLengthViolation,
  maskCodeBlocks,
  maxRewriteChars,
  trimNearMiss,
  findPreservationViolations,
  isQuestionnairePrompt,
  isOnlySubjectPrompt,
  isSubjectInPhotoPrompt,
  parseOptimizationResponse,
  preservationWarnings,
} from "../optimizer-prompt";
import type {
  CompletionResult,
  DiagnosticResult,
  EngineTarget,
  Model,
  OptimizationMode,
  OptimizationResult,
  PromptKind,
  QualityGateResult,
  RejectedDraft,
} from "../types";
import { chatDeepSeek } from "./deepseek";
import { ProviderError } from "./completion";
import { runDiagnostics, runQualityGate } from "../decisions";
import { GATE_BY_MODE } from "../gate";

/** The real steps of one run, in order. The interface shows exactly these, never a timed animation. */
export type Stage = "diagnose" | "rewrite" | "verify" | "repair";

export interface OptimizeParams {
  prompt: string;
  kind: PromptKind;
  engineTarget?: EngineTarget;
  mode?: OptimizationMode;
  model: Model;
  deepseekApiKey: string;
  openrouterApiKey?: string;
  /** Server TypeSafe key for diagnostics and the quality gate; tried before Decision-1. */
  typesafeApiKey?: string;
  mouseApiKey?: string;
  signal?: AbortSignal;
  onStage?: (stage: Stage) => void;
}

/** Output budget grows with the input so long prompts are not cut off mid-JSON (~3.5 chars per token). */
export function rewriteMaxTokens(prompt: string): number {
  const inputTokens = Math.ceil(prompt.length / 3.5);
  return Math.min(8000, Math.max(2200, inputTokens * 2 + 800));
}
const PLACEHOLDER_GUARD_KINDS = new Set<PromptKind>(["user", "system"]);

type ParsedRewrite = ReturnType<typeof parseOptimizationResponse> & {
  completion?: Omit<CompletionResult, "content">;
};

interface Verification {
  gate?: QualityGateResult;
  defects: string[];
  passed: boolean;
}

/**
 * The rewriter's own questions are specific to this prompt; the diagnostic ones are generic templates.
 * Show the generic ones only when the rewriter asked nothing.
 */
function mergeUnresolvedQuestions(
  diagnosticQuestions: string[] | undefined,
  rewriterQuestions: string[] | undefined,
): string[] {
  const sources = rewriterQuestions?.length ? [rewriterQuestions] : [diagnosticQuestions];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of sources) {
    for (const question of source ?? []) {
      const key = question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(question);
    }
  }
  return out;
}

function resolveSuggestedKind(
  diagnostics: DiagnosticResult,
  actualKind: PromptKind,
): PromptKind | undefined {
  return diagnostics.suggestedKind && diagnostics.suggestedKind !== actualKind
    ? diagnostics.suggestedKind
    : undefined;
}

export async function optimizePrompt(params: OptimizeParams): Promise<OptimizationResult> {
  const mode = params.mode ?? "minimal";
  const isImageOrVideo = params.kind === "image" || params.kind === "video";
  const hasSubjectPrefix = isImageOrVideo && isSubjectInPhotoPrompt(params.prompt);
  const isOnlySubject = hasSubjectPrefix && isOnlySubjectPrompt(params.prompt);
  const placeholderGuard = PLACEHOLDER_GUARD_KINDS.has(params.kind);

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
      assumptions: [],
      warnings: [],
      unresolvedQuestions: [],
    };
  }

  params.onStage?.("diagnose");
  const diagnostics = await runDiagnostics({
    prompt: params.prompt,
    kind: params.kind,
    typesafeKey: params.typesafeApiKey,
    mouseKey: params.mouseApiKey,
    openrouterKey: params.openrouterApiKey,
    signal: params.signal,
  });

  const attemptRewrite = async (
    repair?: {
      firstDraft: string;
      gate?: QualityGateResult;
      issues: string[];
    },
    allowRetry = true,
  ): Promise<ParsedRewrite> => {
    const messages = repair
      ? buildRepairMessages(
          params.prompt,
          params.kind,
          diagnostics,
          params.engineTarget,
          mode,
          repair,
        )
      : buildOptimizerMessages(params.prompt, params.kind, diagnostics, params.engineTarget, mode);

    const callRewriter = (system: string, user: string) =>
      chatDeepSeek({
        apiKey: params.deepseekApiKey,
        openrouterApiKey: params.openrouterApiKey,
        model: params.model,
        system,
        user,
        jsonMode: true,
        maxTokens: rewriteMaxTokens(params.prompt),
        signal: params.signal,
      });

    const finalize = ({ content, ...completion }: CompletionResult): ParsedRewrite => {
      const parsed: ParsedRewrite = {
        ...parseOptimizationResponse(content, params.kind, params.prompt, params.engineTarget),
        completion,
      };

      parsed.optimized = trimNearMiss(parsed.optimized, maxRewriteChars(params.prompt, params.kind));
      if (hasSubjectPrefix) {
        parsed.optimized = enforceIdentityLock(parsed.optimized, params.kind);
        if (!parsed.changes.some((c) => /identity lock|likeness|facial geometry/i.test(c))) {
          parsed.changes.unshift(
            "Enforced reference photo identity lock (exact likeness, facial geometry / proportions)",
          );
        }
      }

      return parsed;
    };

    const looksLikeRawJsonDump = (text: string) =>
      text.trim().startsWith("{") && text.trim().includes('"optimized"');

    // One retry when the model returned something unusable; a second failure surfaces as an error.
    const attempt = async (): Promise<ParsedRewrite> => {
      const parsed = finalize(await callRewriter(messages.system, messages.user));
      if (looksLikeRawJsonDump(parsed.optimized))
        throw new ProviderError("The rewrite came back as raw JSON. No candidate was accepted.");
      return parsed;
    };
    try {
      return await attempt();
    } catch (error) {
      const unusable = error instanceof ProviderError && error.status === 502 && !params.signal?.aborted;
      if (!allowRetry || !unusable) throw error;
      return attempt();
    }
  };

  const evaluate = async (optimized: string): Promise<QualityGateResult | undefined> => {
    if (!params.openrouterApiKey?.trim() && !params.typesafeApiKey?.trim() && !params.mouseApiKey?.trim())
      return undefined;
    return runQualityGate({
      // Judge against the locked original, or the lock sentence itself reads as intent drift.
      original: maskCodeBlocks(original()),
      optimized: maskCodeBlocks(optimized),
      mode,
      typesafeKey: params.typesafeApiKey,
      mouseKey: params.mouseApiKey,
      openrouterKey: params.openrouterApiKey,
      signal: params.signal,
    });
  };

  const verify = async (optimized: string): Promise<Verification> => {
    const gate = await evaluate(optimized);
    const defects = [
      ...(placeholderGuard ? findFabricatedPlaceholders(params.prompt, optimized) : []),
      ...findPreservationViolations(params.prompt, optimized),
      ...findLengthViolation(params.prompt, optimized, params.kind),
      ...(placeholderGuard && isQuestionnairePrompt(optimized)
        ? ["the optimized text is a questionnaire; questions belong in the separate questions field"]
        : []),
    ];
    const passed = (gate === undefined || gate.passed) && defects.length === 0;
    return { gate, defects, passed };
  };

  const describeDefectSummary = (defects: string[]): string => {
    if (defects.length === 0) return "";
    return ` Recurring defects: ${defects.slice(0, 3).join("; ")}.`;
  };

  const original = () => (hasSubjectPrefix ? enforceIdentityLock(params.prompt, params.kind) : params.prompt);

  const describeGate = (gate?: QualityGateResult) =>
    gate
      ? `intent ${Math.round(gate.intentPreserved * 100)}%, verbosity risk ${Math.round(gate.overEngineered * 100)}%${
          gate.improvement !== undefined ? `, improvement ${Math.round(gate.improvement * 100)}%` : ""
        } (${gate.judge ?? "model"})`
      : "deterministic checks only";

  const limits = GATE_BY_MODE[mode];
  const gateProblems = (gate?: QualityGateResult): string[] => {
    if (!gate || gate.passed) return [];
    const out: string[] = [];
    if (gate.intentPreserved < limits.intentPreserved) out.push(`intent match only ${Math.round(gate.intentPreserved * 100)}%`);
    if (gate.overEngineered > limits.overEngineered) out.push(`verbosity risk ${Math.round(gate.overEngineered * 100)}%`);
    return out;
  };

  const returnOriginal = (
    gate: QualityGateResult | undefined,
    defects: string[],
    draft: ParsedRewrite,
    draftProblems: string[],
  ): OptimizationResult => {
    return {
      optimized: original(),
      negativePrompt: undefined,
      summary: `Verification rejected both rewrites, so your original prompt is preserved unchanged.${describeDefectSummary(defects)} Gate verdict: ${describeGate(gate)}. The closest rewrite is shown below with its problems, so you can judge it yourself.`,
      changes: [],
      assumptions: [],
      warnings: [],
      diagnostics,
      qualityGate: gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: diagnostics.unresolvedQuestions ?? [],
      completion: draft.completion,
      rejectedDraft: {
        optimized: draft.optimized,
        negativePrompt: draft.negativePrompt,
        reason: "failed",
        problems: draftProblems,
      },
    };
  };

  /** The rewrite passed but Decision-1 doesn't see it as clearly better: keep the original, offer the draft. */
  const isMarginal = (gate?: QualityGateResult) =>
    gate?.improvement !== undefined && gate.improvement < limits.minImprovement;

  const returnMarginal = (draft: ParsedRewrite, gate: QualityGateResult): OptimizationResult => {
    const rejectedDraft: RejectedDraft = {
      optimized: draft.optimized,
      negativePrompt: draft.negativePrompt,
      reason: "marginal",
      problems: [`only ${Math.round((gate.improvement ?? 0) * 100)}% likely to work better than your original`],
    };
    return {
      optimized: original(),
      negativePrompt: undefined,
      summary: `Your prompt was already effective: the rewrite kept your intent but was not clearly better (${describeGate(gate)}), so your original is kept. The rewrite is shown below if you want it anyway.`,
      changes: [],
      assumptions: [],
      warnings: [],
      diagnostics,
      qualityGate: gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: mergeUnresolvedQuestions(diagnostics.unresolvedQuestions, draft.questions),
      completion: draft.completion,
      rejectedDraft,
    };
  };

  const accept = (draft: ParsedRewrite, gate?: QualityGateResult): OptimizationResult => {
    const warnings = preservationWarnings(params.prompt, draft.optimized, mode);
    if (mode !== "creative" && draft.assumptions.length)
      warnings.push("The rewrite listed assumptions outside creative mode. Review these additions.");
    return {
      optimized: draft.optimized,
      negativePrompt: draft.negativePrompt,
      summary: draft.summary,
      changes: draft.changes,
      assumptions: draft.assumptions,
      warnings,
      diagnostics,
      qualityGate: gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: mergeUnresolvedQuestions(diagnostics.unresolvedQuestions, draft.questions),
      completion: draft.completion,
    };
  };

  params.onStage?.("rewrite");
  const first = await attemptRewrite();
  params.onStage?.("verify");
  const firstVerification = await verify(first.optimized);

  if (firstVerification.passed && isMarginal(firstVerification.gate)) {
    return returnMarginal(first, firstVerification.gate!);
  }
  if (firstVerification.passed) return accept(first, firstVerification.gate);

  params.onStage?.("repair");
  const repaired = await attemptRewrite({
    firstDraft: first.optimized,
    gate: firstVerification.gate,
    issues: firstVerification.defects,
  });
  params.onStage?.("verify");
  const repairedVerification = await verify(repaired.optimized);

  if (repairedVerification.passed && isMarginal(repairedVerification.gate)) {
    return returnMarginal(repaired, repairedVerification.gate!);
  }
  if (repairedVerification.passed) return accept(repaired, repairedVerification.gate);

  const unresolvedGate = firstVerification.gate ?? repairedVerification.gate;
  // the repaired draft is usually closer; keep the first one only if the repair made things worse
  const repairedWorse = repairedVerification.defects.length > firstVerification.defects.length;
  const [draft, draftVerification] = repairedWorse
    ? [first, firstVerification]
    : [repaired, repairedVerification];
  return returnOriginal(
    unresolvedGate,
    [...firstVerification.defects, ...repairedVerification.defects],
    draft,
    [...draftVerification.defects, ...gateProblems(draftVerification.gate)],
  );
}
