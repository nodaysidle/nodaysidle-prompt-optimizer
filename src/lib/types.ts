export type PromptKind = "user" | "system" | "image";

export interface DiagnosticResult {
  clarityScore: number; // 0 to 3
  clarityLabel: string;
  isAmbiguous: number; // 0..1 probability
  lacksConstraints: number; // 0..1 probability
  lacksRole: number; // 0..1 probability
  injectionRisk: number; // 0..1 probability
  suggestedKind?: PromptKind;
  issues: string[];
  strengths: string[];
}

export interface QualityGateResult {
  intentPreserved: number; // 0..1
  overEngineered: number; // 0..1
  passed: boolean;
}

export interface OptimizationResult {
  optimized: string;
  summary: string;
  changes: string[];
  diagnostics?: DiagnosticResult;
  qualityGate?: QualityGateResult;
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
