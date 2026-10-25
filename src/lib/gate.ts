import type { OptimizationMode } from "./types";

export interface GateThresholds {
  intentPreserved: number;
  overEngineered: number;
  /** Below this, a rewrite that passes the gate is "not clearly better" and the original is kept. */
  minImprovement: number;
}

/**
 * Light edit keeps the strict line. Restructure and creative add headings and length on purpose,
 * so the verbosity ceiling and the "clearly better" bar are looser there. Intent stays at 0.7 everywhere.
 */
export const GATE_BY_MODE: Record<OptimizationMode, GateThresholds> = {
  minimal: { intentPreserved: 0.7, overEngineered: 0.4, minImprovement: 0.45 },
  structured: { intentPreserved: 0.7, overEngineered: 0.55, minImprovement: 0.35 },
  creative: { intentPreserved: 0.7, overEngineered: 0.55, minImprovement: 0.35 },
};
