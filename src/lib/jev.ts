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
              image: "Visual still image generation prompt",
              video: "Video or motion generation prompt (Veo 3.1, Kling, Runway, Omni)",
            },
          ),
          lacks_temporal_action: noul(
            "Does `prompt` lack temporal progression, movement over time, or dynamic action (reads like a static still photo instead of dynamic video)?",
          ),
          lacks_camera_movement: noul(
            "Does `prompt` fail to describe camera choreography, lens motion, tracking, pan, or cinematographic angles?",
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

      const lacksTemporalAction =
        answers.lacks_temporal_action && "noul" in answers.lacks_temporal_action
          ? answers.lacks_temporal_action.noul
          : 0.5;

      const lacksCameraMovement =
        answers.lacks_camera_movement && "noul" in answers.lacks_camera_movement
          ? answers.lacks_camera_movement.noul
          : 0.5;

      const issues: string[] = [];
      const strengths: string[] = [];

      if (isAmbiguous > 0.6) issues.push("Ambiguous scope or objective");
      if (lacksConstraints > 0.6) issues.push("Missing output format or negative constraints");
      if (lacksRole > 0.65) issues.push("No defined persona or system boundary");
      if (injectionRisk > 0.5) issues.push("Potential prompt injection pattern detected");

      if (params.kind === "video" || suggestedKindChoice === "video") {
        if (lacksTemporalAction > 0.6) issues.push("Lacks temporal progression or pacing over time");
        if (lacksCameraMovement > 0.6) issues.push("Missing camera movement choreography (pan, tracking, dolly)");
        if (lacksTemporalAction < 0.35) strengths.push("Strong motion dynamics & temporal progression");
        if (lacksCameraMovement < 0.35) strengths.push("Explicit camera path & cinematographic movement");
      }

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
        lacksTemporalAction,
        lacksCameraMovement,
        suggestedKind: suggestedKindChoice,
        issues,
        strengths,
      };
    } catch (err) {
      console.warn("Jev API call failed, falling back to heuristic diagnostics:", err);
    }
  }

  // Fallback heuristic diagnostics when Jev key is not configured or offline
  return runHeuristicDiagnostics(params.prompt, params.kind);
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
function runHeuristicDiagnostics(text: string, kind?: PromptKind): DiagnosticResult {
  const len = text.trim().length;
  const words = text.trim().split(/\s+/).length;

  const hasConstraints = /do not|never|format|json|xml|markdown|table|bullet|limit|output:|schema/i.test(text);
  const hasRole = /you are|act as|role:|persona|expert/i.test(text);
  const isVague = words < 12 || /something|help me with|do whatever/i.test(text);
  const injection = /ignore previous|disregard|system prompt|jailbreak/i.test(text);

  const hasCameraMotion = /camera|tracking|dolly|pan|tilt|zoom|crane|fpv|steadicam|orbit|aerial|gimbal|slow motion|motion blur/i.test(text);
  const hasTemporalAction = /drifting|accelerat|running|jumping|moving|racing|walking|speed|billowing|flowing|flying|explosion|spinning|smoke|particles|seconds|\b[0-9]+s\b/i.test(text);
  const isVideoHint = /veo|kling|runway|omni|video|fps|frame rate|timelapse|slow motion|camera path/i.test(text);

  let clarityScore = 1;
  if (words > 40 && hasConstraints) clarityScore = 3;
  else if (words > 20 && (hasConstraints || hasRole)) clarityScore = 2;
  else if (words < 8) clarityScore = 0;

  const isSubjectRef = /^the subject in the photo/i.test(text.trim());
  const issues: string[] = [];
  const strengths: string[] = [];

  if (isVague && !isSubjectRef) issues.push("Brief or ambiguous scope");
  if (!hasConstraints && !isSubjectRef) issues.push("Lacks explicit output constraints");
  if (!hasRole && len > 30 && !isSubjectRef) issues.push("No explicit persona/role assigned");
  if (injection) issues.push("Potential injection syntax detected");

  if (isSubjectRef) {
    strengths.push("Reference photo identity lock specified");
  }

  let suggestedKind: PromptKind = kind || "user";
  if (!kind) {
    if (isVideoHint || (hasCameraMotion && hasTemporalAction)) {
      suggestedKind = "video";
    } else if (hasRole || /system instructions|operational parameters/i.test(text)) {
      suggestedKind = "system";
    } else if (isSubjectRef || /photorealistic|4k|octane|unreal engine|cinematic|portrait|lens|bokeh/i.test(text)) {
      suggestedKind = "image";
    }
  }

  // Video-specific diagnostic evaluation
  let lacksTemporalAction = 0.5;
  let lacksCameraMovement = 0.5;

  if (suggestedKind === "video") {
    lacksTemporalAction = hasTemporalAction ? 0.2 : 0.85;
    lacksCameraMovement = hasCameraMotion ? 0.2 : 0.85;

    if (!hasTemporalAction) {
      issues.push("Lacks temporal progression or pacing over time");
    } else {
      strengths.push("Dynamic motion and physical progression described");
    }

    if (!hasCameraMotion) {
      issues.push("Missing camera movement choreography (e.g. tracking, pan, dolly)");
    } else {
      strengths.push("Explicit camera motion path specified");
    }
  }

  if (hasConstraints) strengths.push("Contains format/boundary instructions");
  if (hasRole) strengths.push("Clear persona established");
  if (words >= 15 && !isVague) strengths.push("Sufficient context provided");

  return {
    clarityScore,
    clarityLabel: CLARITY_LEGEND[clarityScore] || "Basic",
    isAmbiguous: isVague ? 0.8 : 0.25,
    lacksConstraints: hasConstraints ? 0.2 : 0.85,
    lacksRole: hasRole ? 0.15 : 0.75,
    injectionRisk: injection ? 0.9 : 0.05,
    lacksTemporalAction,
    lacksCameraMovement,
    suggestedKind,
    issues,
    strengths,
  };
}
