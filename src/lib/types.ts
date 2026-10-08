export type PromptKind = "user" | "system" | "image" | "video";

export interface DiagnosticResult {
  clarityScore: number; // 0 to 3
  clarityLabel: string;
  isAmbiguous: number; // 0..1 probability
  lacksConstraints: number; // 0..1 probability
  lacksRole: number; // 0..1 probability
  injectionRisk: number; // 0..1 probability
  lacksTemporalAction?: number; // 0..1 probability (video prompts)
  lacksCameraMovement?: number; // 0..1 probability (video prompts)
  suggestedKind?: PromptKind;
  issues: string[];
  strengths: string[];
}

export type EngineTarget =
  | "universal"
  | "midjourney"
  | "flux"
  | "sd"
  | "veo"
  | "kling"
  | "runway";

export interface QualityGateResult {
  intentPreserved: number; // 0..1
  overEngineered: number; // 0..1
  passed: boolean;
}

export interface OptimizationResult {
  optimized: string;
  negativePrompt?: string;
  summary: string;
  changes: string[];
  diagnostics?: DiagnosticResult;
  qualityGate?: QualityGateResult;
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
  typesafeApiKey?: string;
  autoDiagnose: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  typesafeApiKey: "",
  autoDiagnose: true,
};
