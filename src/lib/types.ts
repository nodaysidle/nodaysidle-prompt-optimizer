export const PROMPT_KINDS = ["user", "system", "image", "video"] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];
export const MODES = ["minimal", "structured", "creative"] as const;
export type OptimizationMode = (typeof MODES)[number];
export const ENGINE_TARGETS = ["universal", "midjourney", "flux", "sd", "veo", "kling", "runway"] as const;
export type EngineTarget = (typeof ENGINE_TARGETS)[number];
export const MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export type Model = (typeof MODELS)[number];
export type DiagnosticSource = "local" | "openrouter" | "typesafe";
export interface Finding { title: string; why: string; question: string; }
export interface DiagnosticResult {
  source: DiagnosticSource;
  fallback?: string;
  clarityScore: number;
  clarityLabel: string;
  isAmbiguous: number;
  lacksConstraints: number;
  lacksRole: number;
  injectionRisk: number;
  lacksTemporalAction?: number;
  lacksCameraMovement?: number;
  suggestedKind?: PromptKind;
  issues: string[];
  strengths: string[];
  findings: Finding[];
}
export interface QualityGateResult {
  state: "passed" | "needsReview" | "unavailable";
  intentPreserved?: number;
  overEngineered?: number;
  passed: boolean;
  reason: string;
  source: DiagnosticSource;
}
export interface CompletionResult {
  content: string;
  model: string;
  elapsedMs: number;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
export interface DraftSnapshot {
  prompt: string;
  kind: PromptKind;
  mode: OptimizationMode;
  engineTarget: EngineTarget;
  profileVersion: string;
  model: Model;
}
export interface OptimizationResult {
  optimized: string;
  negativePrompt?: string;
  summary: string;
  changes: string[];
  assumptions: string[];
  questions: string[];
  warnings: string[];
  diagnostics?: DiagnosticResult;
  qualityGate: QualityGateResult;
  completion?: Omit<CompletionResult, "content">;
}
export interface PromptHistoryItem extends DraftSnapshot, OptimizationResult {
  id: string;
  createdAt: number;
  original: string;
  isFavorite: boolean;
  schemaVersion: 2;
}
export interface AppSettings {
  deepseekApiKey: string;
  deepseekModel: Model;
  typesafeApiKey: string;
  openrouterApiKey: string;
  appAccessToken: string;
  autoDiagnose: boolean;
  diagnosticSource: DiagnosticSource;
  allowLocalFallback: boolean;
  rememberKeys: boolean;
}
export const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: "", deepseekModel: "deepseek-flash", typesafeApiKey: "",
  openrouterApiKey: "", appAccessToken: "", autoDiagnose: true,
  diagnosticSource: "local", allowLocalFallback: false, rememberKeys: false,
};
export interface ServerConfig { sharedAccess: boolean; deepseek: boolean; openrouter: boolean; typesafe: boolean; }
