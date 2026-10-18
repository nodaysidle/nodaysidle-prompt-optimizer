export type PromptKind = "user" | "system" | "image" | "video";

export interface DiagnosticResult {
  clarityScore: number; // 0 to 3
  clarityLabel: string;
  isAmbiguous: number; // 0..1 probability
  lacksConstraints: number; // 0..1 probability
  lacksRole: number; // 0..1 probability
  injectionRisk: number; // 0..1 probability
  conflictingInstructions?: number; // 0..1 probability (system prompts)
  lacksTemporalAction?: number; // 0..1 probability (video prompts)
  lacksCameraMovement?: number; // 0..1 probability (video prompts)
  suggestedKind?: PromptKind;
  issues: string[];
  strengths: string[];
  unresolvedQuestions?: string[];
  engine?: string;
  heuristic?: boolean;
}

export type EngineTarget =
  | "universal"
  | "nano-banana"
  | "gpt-image"
  | "veo"
  | "omni";

export const ENGINE_TARGETS: readonly EngineTarget[] = ["universal", "nano-banana", "gpt-image", "veo", "omni"];

/** Older saved history items may carry retired targets (midjourney, flux, ...); treat them as universal. */
export function normalizeEngineTarget(value: unknown): EngineTarget {
  return ENGINE_TARGETS.includes(value as EngineTarget) ? (value as EngineTarget) : "universal";
}

export interface QualityGateResult {
  intentPreserved: number; // 0..1
  overEngineered: number; // 0..1
  improvement?: number; // 0..1, is the rewrite more likely to get the intended result than the original
  passed: boolean;
  judge?: string;
}

export interface OptimizationResult {
  optimized: string;
  negativePrompt?: string;
  summary: string;
  changes: string[];
  diagnostics?: DiagnosticResult;
  qualityGate?: QualityGateResult;
  suggestedKind?: PromptKind;
  unresolvedQuestions?: string[];
  /** Set when the original prompt is returned: the closest rewrite, for the user to judge. */
  rejectedDraft?: RejectedDraft;
}

export interface RejectedDraft {
  optimized: string;
  negativePrompt?: string;
  /** "failed": both rewrites failed verification; "marginal": the rewrite passed but was not clearly better. */
  reason: "failed" | "marginal";
  problems: string[];
}

export interface PromptHistoryItem {
  id: string;
  createdAt: number;
  original: string;
  optimized: string;
  negativePrompt?: string;
  kind: PromptKind;
  engineTarget?: EngineTarget;
  summary: string;
  isFavorite: boolean;
}

export interface AppSettings {
  deepseekApiKey?: string;
  deepseekModel: string;
  openrouterApiKey?: string;
  autoDiagnose: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  deepseekModel: "deepseek-v4.1-flash",
  openrouterApiKey: "",
  autoDiagnose: true,
};
