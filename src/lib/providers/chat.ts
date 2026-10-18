import {
  IDENTITY_LOCK_OUTPUT,
  buildOptimizerMessages,
  buildRepairMessages,
  enforceIdentityLock,
  findFabricatedPlaceholders,
  findLengthViolation,
  findPreservationViolations,
  isQuestionnairePrompt,
  isOnlySubjectPrompt,
  isSubjectInPhotoPrompt,
  parseOptimizationResponse,
} from "../optimizer-prompt";
import type {
  DiagnosticResult,
  EngineTarget,
  OptimizationResult,
  PromptKind,
  QualityGateResult,
  RejectedDraft,
} from "../types";
import { chatDeepSeek } from "./deepseek";
import { MIN_IMPROVEMENT, runDiagnostics, runQualityGate } from "../decisions";

export interface OptimizeParams {
  prompt: string;
  kind: PromptKind;
  engineTarget?: EngineTarget;
  deepseekApiKey: string;
  deepseekModel?: string;
  openrouterApiKey?: string;
  existingDiagnostics?: DiagnosticResult;
}

/** Output budget grows with the input so long prompts are not cut off mid-JSON (~3.5 chars per token). */
export function rewriteMaxTokens(prompt: string): number {
  const inputTokens = Math.ceil(prompt.length / 3.5);
  return Math.min(8000, Math.max(2200, inputTokens * 2 + 800));
}
const PLACEHOLDER_GUARD_KINDS = new Set<PromptKind>(["user", "system"]);

type ParsedRewrite = ReturnType<typeof parseOptimizationResponse>;

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
      diagnostics: params.existingDiagnostics,
      unresolvedQuestions: [],
    };
  }

  const diagnostics =
    params.existingDiagnostics ||
    (await runDiagnostics({
      prompt: params.prompt,
      kind: params.kind,
      openrouterKey: params.openrouterApiKey,
    }));

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
          repair,
        )
      : buildOptimizerMessages(params.prompt, params.kind, diagnostics, params.engineTarget);

    const callRewriter = (system: string, user: string) =>
      chatDeepSeek({
        apiKey: params.deepseekApiKey,
        openrouterApiKey: params.openrouterApiKey,
        model: params.deepseekModel || "deepseek-chat",
        system,
        user,
        jsonMode: true,
        maxTokens: rewriteMaxTokens(params.prompt),
      });

    const finalize = (raw: string): ParsedRewrite => {
      const parsed = parseOptimizationResponse(raw, params.kind, params.prompt);

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

    let first = finalize(await callRewriter(messages.system, messages.user));
    if (allowRetry && looksLikeRawJsonDump(first.optimized)) {
      const retried = finalize(await callRewriter(messages.system, messages.user));
      if (!looksLikeRawJsonDump(retried.optimized)) {
        first = retried;
      }
    }
    return first;
  };

  const evaluate = async (optimized: string): Promise<QualityGateResult | undefined> => {
    if (
      !params.openrouterApiKey?.trim() &&
      !process.env.OPENROUTER_API_KEY?.trim()
    ) {
      return undefined;
    }
    return runQualityGate({
      original: params.prompt,
      optimized,
      openrouterKey: params.openrouterApiKey,
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

  const gateProblems = (gate?: QualityGateResult): string[] => {
    if (!gate || gate.passed) return [];
    const out: string[] = [];
    if (gate.intentPreserved < 0.7) out.push(`intent match only ${Math.round(gate.intentPreserved * 100)}%`);
    if (gate.overEngineered > 0.4) out.push(`verbosity risk ${Math.round(gate.overEngineered * 100)}%`);
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
      diagnostics,
      qualityGate: gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: diagnostics.unresolvedQuestions,
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
    gate?.improvement !== undefined && gate.improvement < MIN_IMPROVEMENT;

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
      diagnostics,
      qualityGate: gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: mergeUnresolvedQuestions(diagnostics.unresolvedQuestions, draft.questions),
      rejectedDraft,
    };
  };

  const first = await attemptRewrite();
  const firstVerification = await verify(first.optimized);

  if (firstVerification.passed && isMarginal(firstVerification.gate)) {
    return returnMarginal(first, firstVerification.gate!);
  }

  if (firstVerification.passed) {
    return {
      optimized: first.optimized,
      negativePrompt: first.negativePrompt,
      summary: first.summary,
      changes: first.changes,
      diagnostics,
      qualityGate: firstVerification.gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: mergeUnresolvedQuestions(
        diagnostics.unresolvedQuestions,
        first.questions,
      ),
    };
  }

  const repaired = await attemptRewrite({
    firstDraft: first.optimized,
    gate: firstVerification.gate,
    issues: firstVerification.defects,
  });
  const repairedVerification = await verify(repaired.optimized);

  if (repairedVerification.passed && isMarginal(repairedVerification.gate)) {
    return returnMarginal(repaired, repairedVerification.gate!);
  }

  if (repairedVerification.passed) {
    return {
      optimized: repaired.optimized,
      negativePrompt: repaired.negativePrompt,
      summary: repaired.summary,
      changes: repaired.changes,
      diagnostics,
      qualityGate: repairedVerification.gate,
      suggestedKind: resolveSuggestedKind(diagnostics, params.kind),
      unresolvedQuestions: mergeUnresolvedQuestions(
        diagnostics.unresolvedQuestions,
        repaired.questions,
      ),
    };
  }

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
