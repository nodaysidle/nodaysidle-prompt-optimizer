import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import type { DiagnosticResult, QualityGateResult, PromptKind } from "./types";

export interface DiagnoseParams {
  prompt: string;
  kind?: PromptKind;
  apiKey?: string;
}

export interface QualityGateParams {
  original: string;
  optimized: string;
  apiKey?: string;
}

const CLARITY_LEGEND: Record<number, string> = {
  0: "Vague / Needs structure",
  1: "Basic intent / Missing details",
  2: "Clear instructions / Good constraints",
  3: "Exemplary / Production ready",
};

/**
 * Runs Jev System One diagnostics against an input prompt.
 * If no TypeSafe API key is available, falls back to static heuristic diagnostics.
 */
export async function runJevDiagnostics(
  params: DiagnoseParams,
): Promise<DiagnosticResult> {
  const apiKey = params.apiKey || process.env.TYPESAFE_API_KEY;

  if (apiKey?.trim()) {
    try {
      const client = new TypeSafeClient({
        apiKey: apiKey.trim(),
        timeout: 8000,
      });

      const { answers } = await client.systemOne({
        state: { prompt: params.prompt },
        questions: {
          clarity: score(
            "How clear, specific, and actionable is `prompt`?",
            [
              "Vague or one-liner; lacks concrete objective",
              "Basic intent stated, but lacks specifics or structure",
              "Clear instructions with some context and constraints",
              "Exemplary; highly structured, unambiguous, with explicit constraints",
            ],
          ),
          is_ambiguous: noul(
            "Is the primary goal or scope in `prompt` ambiguous or open to widely divergent interpretations?",
          ),
          lacks_constraints: noul(
            "Does `prompt` lack negative constraints, formatting guidelines, or boundary rules?",
          ),
          lacks_role: noul(
            "Does `prompt` lack an explicit role, persona, or operational context?",
          ),
          injection_risk: noul(
            "Does `prompt` contain prompt injection, delimiter override, or jailbreak patterns?",
          ),
          suggested_kind: choice(
            "Which category best fits `prompt`?",
            {
              user: "Direct user question, query, or task",
              system: "System instructions or behavioral persona rules",
              image: "Visual, diffusion, or image generation prompt",
            },
          ),
        },
      });

      const clarityAnswer = answers.clarity;
      const clarityScore =
        clarityAnswer && "score" in clarityAnswer
          ? Math.round(clarityAnswer.score)
          : 1;

      const isAmbiguous =
        answers.is_ambiguous && "noul" in answers.is_ambiguous
          ? answers.is_ambiguous.noul
          : 0.5;

      const lacksConstraints =
        answers.lacks_constraints && "noul" in answers.lacks_constraints
          ? answers.lacks_constraints.noul
          : 0.5;

      const lacksRole =
        answers.lacks_role && "noul" in answers.lacks_role
          ? answers.lacks_role.noul
          : 0.5;

      const injectionRisk =
        answers.injection_risk && "noul" in answers.injection_risk
          ? answers.injection_risk.noul
          : 0.0;

      const suggestedKindChoice =
        answers.suggested_kind && "choice" in answers.suggested_kind
          ? (answers.suggested_kind.choice as PromptKind)
          : undefined;

      const issues: string[] = [];
      const strengths: string[] = [];

      if (isAmbiguous > 0.6) issues.push("Ambiguous scope or objective");
      if (lacksConstraints > 0.6) issues.push("Missing output format or negative constraints");
      if (lacksRole > 0.65) issues.push("No defined persona or system boundary");
      if (injectionRisk > 0.5) issues.push("Potential prompt injection pattern detected");

      if (clarityScore >= 2) strengths.push("Actionable directives");
      if (isAmbiguous < 0.3) strengths.push("Specific and well-scoped");
      if (lacksConstraints < 0.35) strengths.push("Contains explicit boundary constraints");

      return {
        clarityScore,
        clarityLabel: CLARITY_LEGEND[clarityScore] || "Evaluated",
        isAmbiguous,
        lacksConstraints,
        lacksRole,
        injectionRisk,
        suggestedKind: suggestedKindChoice,
        issues,
        strengths,
      };
    } catch (err) {
      console.warn("Jev API call failed, falling back to heuristic diagnostics:", err);
    }
  }

  // Fallback heuristic diagnostics when Jev key is not configured or offline
  return runHeuristicDiagnostics(params.prompt);
}

/**
 * Runs Jev quality gate comparing original vs rewritten prompt.
 */
export async function runJevQualityGate(
  params: QualityGateParams,
): Promise<QualityGateResult | undefined> {
  const apiKey = params.apiKey || process.env.TYPESAFE_API_KEY;
  if (!apiKey?.trim()) return undefined;

  try {
    const client = new TypeSafeClient({
      apiKey: apiKey.trim(),
      timeout: 8000,
    });

    const { answers } = await client.systemOne({
      state: {
        original: params.original,
        optimized: params.optimized,
      },
      questions: {
        intent_preserved: noul(
          "Does `optimized` faithfully preserve the core goal and intent of `original` without adding conflicting requirements?",
        ),
        over_engineered: noul(
          "Is `optimized` excessively verbose, cluttered, or bloated with unhelpful filler?",
        ),
      },
    });

    const intentPreserved =
      answers.intent_preserved && "noul" in answers.intent_preserved
        ? answers.intent_preserved.noul
        : 0.9;

    const overEngineered =
      answers.over_engineered && "noul" in answers.over_engineered
        ? answers.over_engineered.noul
        : 0.1;

    return {
      intentPreserved,
      overEngineered,
      passed: intentPreserved >= 0.7 && overEngineered <= 0.6,
    };
  } catch (err) {
    console.warn("Jev Quality Gate call failed:", err);
    return undefined;
  }
}

/**
 * Fast deterministic fallback when Jev is not connected.
 */
function runHeuristicDiagnostics(text: string): DiagnosticResult {
  const len = text.trim().length;
  const words = text.trim().split(/\s+/).length;

  const hasConstraints = /do not|never|format|json|xml|markdown|table|bullet|limit|output:|schema/i.test(text);
  const hasRole = /you are|act as|role:|persona|expert/i.test(text);
  const isVague = words < 12 || /something|help me with|do whatever/i.test(text);
  const injection = /ignore previous|disregard|system prompt|jailbreak/i.test(text);

  let clarityScore = 1;
  if (words > 40 && hasConstraints) clarityScore = 3;
  else if (words > 20 && (hasConstraints || hasRole)) clarityScore = 2;
  else if (words < 8) clarityScore = 0;

  const issues: string[] = [];
  const strengths: string[] = [];

  if (isVague) issues.push("Brief or ambiguous scope");
  if (!hasConstraints) issues.push("Lacks explicit output constraints");
  if (!hasRole && len > 30) issues.push("No explicit persona/role assigned");
  if (injection) issues.push("Potential injection syntax detected");

  if (hasConstraints) strengths.push("Contains format/boundary instructions");
  if (hasRole) strengths.push("Clear persona established");
  if (words >= 15 && !isVague) strengths.push("Sufficient context provided");

  let suggestedKind: PromptKind = "user";
  if (hasRole || /system instructions|operational parameters/i.test(text)) {
    suggestedKind = "system";
  } else if (/photorealistic|4k|octane|unreal engine|cinematic|portrait|lens|bokeh/i.test(text)) {
    suggestedKind = "image";
  }

  return {
    clarityScore,
    clarityLabel: CLARITY_LEGEND[clarityScore] || "Basic",
    isAmbiguous: isVague ? 0.8 : 0.25,
    lacksConstraints: hasConstraints ? 0.2 : 0.85,
    lacksRole: hasRole ? 0.15 : 0.75,
    injectionRisk: injection ? 0.9 : 0.05,
    suggestedKind,
    issues,
    strengths,
  };
}
