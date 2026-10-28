import type { DiagnosticResult, OptimizationMode, QualityGateResult, PromptKind } from "./types";
import { DEFECT_TAGS, DEFECT_TAG_LIST, type DefectTag } from "./defects";
import { GATE_BY_MODE } from "./gate";

export interface DiagnoseParams {
  prompt: string;
  kind?: PromptKind;
  mouseKey?: string;
  openrouterKey?: string;
  signal?: AbortSignal;
}

export interface QualityGateParams {
  original: string;
  optimized: string;
  mode?: OptimizationMode;
  mouseKey?: string;
  openrouterKey?: string;
  signal?: AbortSignal;
}

const CLARITY_RUBRIC = [
  "Vague or one-liner; lacks concrete objective",
  "Basic intent stated, but lacks specifics or structure",
  "Clear instructions with some context and constraints",
  "Exemplary; highly structured, unambiguous, with explicit constraints",
];

const CLARITY_LEGEND: Record<number, string> = {
  0: "Vague / Needs structure",
  1: "Basic intent / Missing details",
  2: "Clear instructions / Good constraints",
  3: "Exemplary / Production ready",
};

const SUGGESTED_KIND_CRITERIA = {
  user: "Direct user question, query, or task",
  system: "System instructions or behavioral persona rules",
  image: "Visual still image generation prompt",
  video: "Video or motion generation prompt (Veo 3.1, Gemini Omni 1.1)",
};

const DEFECT_FLAG_ABOVE = 0.65;

type QuestionSpec =
  | { key: string; type: "noul"; instructions: string }
  | { key: string; type: "score"; instructions: string }
  | { key: string; type: "choice"; instructions: string };

const BASE_QUESTIONS: QuestionSpec[] = [
  { key: "clarity", type: "score", instructions: "How clear, specific, and actionable is `prompt` for producing the result the user wants? Judge only what the task type needs; do not penalize the absence of a persona, camera motion, or other dimensions irrelevant to the task." },
  { key: "is_ambiguous", type: "noul", instructions: "Is the primary goal or scope in `prompt` ambiguous or open to widely divergent interpretations that materially change the result?" },
  { key: "lacks_constraints", type: "noul", instructions: "Would `prompt` materially benefit from explicit output constraints, format rules, or boundary rules that it currently lacks?" },
  { key: "injection_risk", type: "noul", instructions: "Does `prompt` contain prompt injection, delimiter override, or jailbreak patterns?" },
  { key: "suggested_kind", type: "choice", instructions: "Which category best fits `prompt`?" },
];

const KIND_EXTRA_QUESTIONS: Partial<Record<PromptKind, QuestionSpec[]>> = {
  system: [
    { key: "lacks_role", type: "noul", instructions: "Would explicitly defining the persona, priorities, or behavioral boundaries materially improve this system prompt, given what it is supposed to govern?" },
    { key: "conflicting_instructions", type: "noul", instructions: "Do any instructions, rules, or examples in `prompt` conflict with or contradict each other?" },
  ],
  video: [
    { key: "lacks_temporal_action", type: "noul", instructions: "Is motion over time (subject or world progression across the shot) central to the intended result of `prompt`, and currently unspecified?" },
    { key: "lacks_camera_movement", type: "noul", instructions: "Is explicit camera behavior (movement, framing changes, lens work) central to the intended result of `prompt`, and currently unspecified?" },
  ],
};

const defectKey = (tag: DefectTag) => tag.toLowerCase();

const DEFECT_QUESTIONS: QuestionSpec[] = DEFECT_TAG_LIST.map((tag) => ({
  key: defectKey(tag),
  type: "noul",
  instructions: DEFECT_TAGS[tag].question,
}));

const hasDefectTags = (kind: PromptKind) => kind === "user" || kind === "system";

function questionsForKind(kind: PromptKind): QuestionSpec[] {
  const extras = KIND_EXTRA_QUESTIONS[kind] ?? [];
  return [...BASE_QUESTIONS, ...extras, ...(hasDefectTags(kind) ? DEFECT_QUESTIONS : [])];
}

function toDecisionShape(specs: QuestionSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    if (spec.type === "noul") {
      out[spec.key] = { type: "noul", instructions: spec.instructions };
    } else if (spec.type === "score") {
      out[spec.key] = { type: "score", instructions: spec.instructions, criteria: CLARITY_RUBRIC };
    } else {
      out[spec.key] = { type: "choice", instructions: spec.instructions, criteria: SUGGESTED_KIND_CRITERIA };
    }
  }
  return out;
}

/** A probability answer; anything outside 0..1 (or not a number) is treated as missing, never as a favourable score. */
function nud(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

type RawAnswer = { score?: unknown; noul?: unknown; choice?: unknown } | undefined;

export function mapDiagnosticAnswers(
  answers: Record<string, RawAnswer> | undefined,
  options: { kind: PromptKind; engine: string; heuristic?: boolean },
): DiagnosticResult {
  const isAmbiguous = nud(answers?.is_ambiguous?.noul, 0.5);
  const lacksConstraints = nud(answers?.lacks_constraints?.noul, 0.5);
  const lacksRole = nud(answers?.lacks_role?.noul, 0.5);
  const conflictingInstructions = nud(answers?.conflicting_instructions?.noul, 0.5);
  const injectionRisk = nud(answers?.injection_risk?.noul, 0);
  const lacksTemporalAction = nud(answers?.lacks_temporal_action?.noul, 0.5);
  const lacksCameraMovement = nud(answers?.lacks_camera_movement?.noul, 0.5);
  const suggestedKindChoice = typeof answers?.suggested_kind?.choice === "string"
    ? (answers.suggested_kind.choice as PromptKind)
    : undefined;

  const issues: string[] = [];
  const strengths: string[] = [];
  const unresolvedQuestions: string[] = [];

  if (isAmbiguous > 0.6) {
    issues.push("Ambiguous scope or objective");
    unresolvedQuestions.push(
      "What specific outcome makes this task a success? State it in the prompt. The optimizer cannot invent it for you.",
    );
  }

  if (lacksConstraints > 0.6) {
    issues.push("Missing output constraints the task itself would benefit from");
    unresolvedQuestions.push(
      "What output format, length, or exclusions do you want? Specify them only if you care. They will otherwise stay unstated.",
    );
  }

  if (options.kind === "system" || suggestedKindChoice === "system") {
    if (lacksRole > 0.65) issues.push("Persona, priorities, or behavioral boundaries undefined for a governing system prompt");
    if (conflictingInstructions > 0.6) {
      issues.push("Instructions appear to conflict with each other");
      unresolvedQuestions.push("Which instruction wins when the conflicting rules meet, and in what order should they apply?");
    }
  }

  if (injectionRisk > 0.5) {
    issues.push("Potential prompt injection pattern detected");
    unresolvedQuestions.push(
      "The prompt contains override-style instructions. Decide whether they are meant for the optimizer or for your target model. They are preserved as data either way.",
    );
  }

  if (options.kind === "video" || suggestedKindChoice === "video") {
    if (lacksTemporalAction > 0.6) issues.push("Motion over time matters for this result but is unspecified");
    if (lacksCameraMovement > 0.6) issues.push("Explicit camera behavior matters for this result but is unspecified");
    if (lacksTemporalAction < 0.3) strengths.push("Temporal progression is well covered");
    if (lacksCameraMovement < 0.3) strengths.push("Camera behavior is explicit where it matters");
  }

  const clarityAnswer = answers?.clarity;
  const clarityScore =
    clarityAnswer &&
    typeof clarityAnswer.score === "number" &&
    Number.isFinite(clarityAnswer.score) &&
    clarityAnswer.score >= 0 &&
    clarityAnswer.score <= 3
      ? Math.round(clarityAnswer.score)
      : 1;

  if (clarityScore >= 2) strengths.push("Actionable directives");
  if (isAmbiguous < 0.3) strengths.push("Specific and well-scoped");
  if (lacksConstraints < 0.35) strengths.push("Contains explicit boundary constraints");

  // a missing answer is "not flagged", never a defect
  const defectTags = hasDefectTags(options.kind)
    ? DEFECT_TAG_LIST.filter((tag) => nud(answers?.[defectKey(tag)]?.noul, 0) > DEFECT_FLAG_ABOVE)
    : [];

  const fields = {
    defectTags: defectTags.length ? defectTags : undefined,
    clarityScore,
    clarityLabel: CLARITY_LEGEND[clarityScore] || "Evaluated",
    isAmbiguous,
    lacksConstraints,
    lacksRole,
    injectionRisk,
    suggestedKind: suggestedKindChoice,
    issues,
    strengths,
    unresolvedQuestions,
    engine: options.heuristic ? `${options.engine} (heuristic rules, not a calibrated model)` : options.engine,
    heuristic: options.heuristic,
  } as DiagnosticResult;

  if (options.kind === "system" || suggestedKindChoice === "system") {
    fields.conflictingInstructions = conflictingInstructions;
  }
  if (options.kind === "video" || suggestedKindChoice === "video") {
    fields.lacksTemporalAction = lacksTemporalAction;
    fields.lacksCameraMovement = lacksCameraMovement;
  }

  return fields;
}

function evaluateGateScores(
  judge: string,
  intentPreserved: number,
  overEngineered: number,
  improvement: number | undefined,
  mode: OptimizationMode,
): QualityGateResult {
  const limits = GATE_BY_MODE[mode];
  return {
    intentPreserved,
    overEngineered,
    improvement,
    passed: intentPreserved >= limits.intentPreserved && overEngineered <= limits.overEngineered,
    judge,
  };
}

interface DecisionBackend {
  url: string;
  model: string;
  judge: string;
  apiKey: string;
  timeout: number;
}

/**
 * Backends in the order they are tried. Mouse answers the same question schema and is
 * usually under a second when warm, so it goes first with a short timeout (a cold call
 * can take far longer); Decision-1 on OpenRouter is the fallback.
 */
function decisionBackends(mouseKey?: string, openrouterKey?: string): DecisionBackend[] {
  const backends: DecisionBackend[] = [];
  if (mouseKey?.trim())
    backends.push({
      url: "https://api.mouse.dev/v1/decisions",
      model: "mouse-1",
      judge: "Mouse-1",
      apiKey: mouseKey.trim(),
      timeout: 3000,
    });
  if (openrouterKey?.trim())
    backends.push({
      url: "https://openrouter.ai/api/alpha/decisions",
      model: "microsoft/microsoft-decision-1",
      judge: "Microsoft-Decision-1",
      apiKey: openrouterKey.trim(),
      timeout: 6000,
    });
  return backends;
}

async function callDecisions(
  backend: DecisionBackend,
  state: Record<string, unknown>,
  questions: Record<string, unknown>,
  parent?: AbortSignal,
): Promise<Record<string, RawAnswer> | undefined> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, backend.timeout);
  try {
    const res = await fetch(backend.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${backend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: backend.model,
        state,
        questions,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${backend.judge} decisions status ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return data?.answers;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

/**
 * Asks each backend in turn until one returns answers that `accept` takes. Throws the last
 * failure when every backend fails; a cancelled request is never retried on the next one.
 */
async function decide<T>(
  backends: DecisionBackend[],
  state: Record<string, unknown>,
  questions: Record<string, unknown>,
  accept: (answers: Record<string, RawAnswer> | undefined, backend: DecisionBackend) => T,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (const backend of backends) {
    try {
      return accept(await callDecisions(backend, state, questions, signal), backend);
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn(`${backend.judge} decisions failed:`, err);
      lastError = err;
    }
  }
  throw lastError;
}

export async function runDiagnostics(
  params: DiagnoseParams,
): Promise<DiagnosticResult> {
  const effectiveKind = params.kind || "user";

  // Keys are resolved by the route, which checks access; never read the server's key here.
  const backends = decisionBackends(params.mouseKey, params.openrouterKey);

  if (!backends.length) {
    return runHeuristicDiagnostics(params.prompt, effectiveKind);
  }

  try {
    return await decide(
      backends,
      { prompt: params.prompt },
      toDecisionShape(questionsForKind(effectiveKind)),
      (answers, backend) =>
        mapDiagnosticAnswers(answers, { kind: effectiveKind, engine: backend.model }),
      params.signal,
    );
  } catch (err) {
    console.warn("Decision diagnostics failed, falling back to heuristics:", err);
    return runHeuristicDiagnostics(params.prompt, effectiveKind);
  }
}

const INTENT_QUESTION =
  "Does `optimized` preserve the core goal and subject of `original` without contradicting it, omitting the user's stated requirements, or adding requirements that conflict with the user's intent? Compatible stylistic or scene elaboration added by `optimized` should not count against intent.";
const IMPROVEMENT_QUESTION =
  "Is `optimized` more likely than `original` to get the result the user wants from the target model? Answer no if the two are about equally good or the changes are cosmetic.";
const OVER_ENGINEERED_QUESTION =
  "Is `optimized` excessively verbose, cluttered, or bloated with filler that does not help the task? Deliberate structure requested by the user does not count as bloat.";
const RESTRUCTURE_NOTE =
  " The user chose Restructure mode: headings, sections, and an output-format line that organise the original's own content are requested structure, not bloat.";

export async function runQualityGate(
  params: QualityGateParams,
): Promise<QualityGateResult | undefined> {
  // Keys are resolved by the route, which checks access; never read the server's key here.
  const backends = decisionBackends(params.mouseKey, params.openrouterKey);

  if (!backends.length) return undefined;

  const mode = params.mode ?? "minimal";
  const overEngineeredQuestion = mode === "minimal" ? OVER_ENGINEERED_QUESTION : OVER_ENGINEERED_QUESTION + RESTRUCTURE_NOTE;

  const inRange = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

  try {
    return await decide(
      backends,
      {
        original: params.original,
        optimized: params.optimized,
      },
      {
        intent_preserved: { type: "noul", instructions: INTENT_QUESTION },
        over_engineered: { type: "noul", instructions: overEngineeredQuestion },
        improves: { type: "noul", instructions: IMPROVEMENT_QUESTION },
      },
      (answers, backend) => {
        if (!answers?.intent_preserved || !answers?.over_engineered) {
          throw new Error(`${backend.judge} gate returned an incomplete answer`);
        }
        const intentPreserved = answers.intent_preserved.noul;
        const overEngineered = answers.over_engineered.noul;
        if (!inRange(intentPreserved) || !inRange(overEngineered)) {
          throw new Error(`${backend.judge} gate returned an invalid answer`);
        }
        const improvement = inRange(answers.improves?.noul) ? answers.improves.noul : undefined;
        return evaluateGateScores(backend.judge, intentPreserved, overEngineered, improvement, mode);
      },
      params.signal,
    );
  } catch (err) {
    console.warn("Decision quality gate failed, skipping gate evaluation:", err);
    return undefined;
  }
}

export function runHeuristicDiagnostics(text: string, kind: PromptKind): DiagnosticResult {
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

  const isSubjectRef = /^the subject (?:in|from) the photo/i.test(text.trim());
  const issues: string[] = [];
  const strengths: string[] = [];
  const unresolvedQuestions: string[] = [];

  if (isVague && !isSubjectRef) {
    issues.push("Brief or ambiguous scope");
    unresolvedQuestions.push("What specific outcome makes this task a success? State it if you can. The optimizer cannot invent it.");
  }
  if (!hasConstraints && !isSubjectRef) issues.push("Lacks explicit output constraints");
  if (!hasRole && len > 30 && kind === "system" && !isSubjectRef) {
    issues.push("Persona or behavioral boundaries undefined for a governing system prompt");
  }
  if (injection) {
    issues.push("Potential injection syntax detected");
    unresolvedQuestions.push("The prompt contains override-style instructions. They are preserved as data; decide whether they target the optimizer or your model.");
  }

  if (isSubjectRef) {
    strengths.push("Reference photo identity lock specified");
  }

  let suggestedKind: PromptKind = kind;
  if (!kind) {
    if (isVideoHint || (hasCameraMotion && hasTemporalAction)) {
      suggestedKind = "video";
    } else if (hasRole || /system instructions|operational parameters/i.test(text)) {
      suggestedKind = "system";
    } else if (isSubjectRef || /photorealistic|4k|octane|unreal engine|cinematic|portrait|lens|bokeh/i.test(text)) {
      suggestedKind = "image";
    }
  }

  const result = {
    clarityScore,
    clarityLabel: CLARITY_LEGEND[clarityScore] || "Basic",
    isAmbiguous: isVague ? 0.8 : 0.25,
    lacksConstraints: hasConstraints ? 0.2 : 0.85,
    lacksRole: hasRole ? 0.15 : 0.75,
    injectionRisk: injection ? 0.9 : 0.05,
    suggestedKind,
    issues,
    strengths,
    unresolvedQuestions,
    engine: "heuristic (rule-based, not a calibrated model)",
    heuristic: true,
  } as DiagnosticResult;

  if (suggestedKind === "video") {
    result.lacksTemporalAction = hasTemporalAction ? 0.2 : 0.85;
    result.lacksCameraMovement = hasCameraMotion ? 0.2 : 0.85;
    if (!hasTemporalAction && hasCameraMotion) {
      result.issues.push("Motion over time matters here but is unspecified");
    }
    if (!hasCameraMotion && hasTemporalAction) {
      result.issues.push("Camera behavior matters here but is unspecified");
    }
    if (hasTemporalAction) result.strengths.push("Dynamic motion described");
    if (hasCameraMotion) result.strengths.push("Camera behavior specified");
  }

  if (hasConstraints) result.strengths.push("Contains format/boundary instructions");
  if (hasRole) result.strengths.push("Persona defined");
  if (words >= 15 && !isVague) result.strengths.push("Sufficient context provided");

  return result;
}
