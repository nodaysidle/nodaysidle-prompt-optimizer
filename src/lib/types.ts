import type { DefectTag } from "./defects";
export const PROMPT_KINDS = ["user", "system", "image", "video"] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];
export const MODES = ["minimal", "structured", "creative"] as const;
export type OptimizationMode = (typeof MODES)[number];
export const ENGINE_TARGETS = [
  "universal",
  "nano-banana",
  "gpt-image",
  "veo",
  "omni",
] as const;
export type EngineTarget = (typeof ENGINE_TARGETS)[number];
/** Older saved history items may carry retired targets (midjourney, flux, ...); treat them as universal. */
export function normalizeEngineTarget(value: unknown): EngineTarget {
  return ENGINE_TARGETS.includes(value as EngineTarget)
    ? (value as EngineTarget)
    : "universal";
}
export const MODELS = ["deepseek-v4.1-flash", "deepseek-v4-pro"] as const;
export type Model = (typeof MODELS)[number];
export const DEFAULT_MODEL: Model = "deepseek-v4.1-flash";
/** Maps any model id ever saved or sent to a current one. */
export function migrateModel(value: unknown): Model {
  return value === "deepseek-v4-pro" ||
    value === "deepseek/deepseek-v4-pro" ||
    value === "deepseek-reasoner"
    ? "deepseek-v4-pro"
    : DEFAULT_MODEL;
}

export interface DiagnosticResult {
  /** Actionable defects the judge flagged (user/system prompts only). */
  defectTags?: DefectTag[];
  clarityScore: number; // 0 to 3
  clarityLabel: string;
  isAmbiguous: number; // 0..1 probability
  lacksConstraints: number; // 0..1 probability
  lacksRole: number; // 0..1 probability
  injectionRisk: number; // 0..1 probability
  conflictingInstructions?: number; // system prompts
  lacksTemporalAction?: number; // video prompts
  lacksCameraMovement?: number; // video prompts
  suggestedKind?: PromptKind;
  issues: string[];
  strengths: string[];
  unresolvedQuestions?: string[];
  /** Which judge produced this, in words. */
  engine?: string;
  /** True when no model was consulted: rule-based estimate only. */
  heuristic?: boolean;
}
export interface QualityGateResult {
  intentPreserved: number; // 0..1
  overEngineered: number; // 0..1
  /** 0..1, is the rewrite more likely to get the intended result than the original. */
  improvement?: number;
  passed: boolean;
  judge?: string;
}
export interface CompletionResult {
  content: string;
  model: string;
  elapsedMs: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
/** What was submitted, kept with the result so a later edit can never rewrite history. */
export interface DraftSnapshot {
  prompt: string;
  kind: PromptKind;
  mode: OptimizationMode;
  engineTarget: EngineTarget;
  profileVersion: string;
  model: Model;
}
export interface RejectedDraft {
  optimized: string;
  negativePrompt?: string;
  /** "failed": both rewrites failed verification; "marginal": the rewrite passed but was not clearly better. */
  reason: "failed" | "marginal";
  problems: string[];
}
export interface OptimizationResult {
  optimized: string;
  negativePrompt?: string;
  summary: string;
  changes: string[];
  assumptions: string[];
  warnings: string[];
  unresolvedQuestions: string[];
  diagnostics?: DiagnosticResult;
  /** Absent when no gate model was available: the checks that ran were deterministic only. */
  qualityGate?: QualityGateResult;
  suggestedKind?: PromptKind;
  /** Set when the original prompt is returned: the closest rewrite, for the user to judge. */
  rejectedDraft?: RejectedDraft;
  completion?: Omit<CompletionResult, "content">;
}
export interface PromptHistoryItem extends DraftSnapshot, OptimizationResult {
  id: string;
  createdAt: number;
  original: string;
  isFavorite: boolean;
  schemaVersion: 3;
}
export interface AppSettings {
  deepseekApiKey: string;
  deepseekModel: Model;
  openrouterApiKey: string;
  appAccessToken: string;
  autoDiagnose: boolean;
  rememberKeys: boolean;
  rememberToken: boolean;
}
export const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  deepseekModel: DEFAULT_MODEL,
  openrouterApiKey: "",
  appAccessToken: "",
  autoDiagnose: true,
  rememberKeys: false,
  rememberToken: false,
};
export interface ServerConfig {
  sharedAccess: boolean;
  deepseek: boolean;
  openrouter: boolean;
}
