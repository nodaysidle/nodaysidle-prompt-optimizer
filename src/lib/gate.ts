import type { OptimizationMode } from "./types";

export interface GateThresholds {
  intentPreserved: number;
  overEngineered: number;
  /** Above this, the gate thinks the rewrite added requirements the original did not state. */
  maxInvented: number;
  /** Below this, a rewrite that passes the gate is "not clearly better" and the original is kept. */
  minImprovement: number;
}

/**
 * Light edit keeps the strict verbosity line but has no "clearly better" bar: a small safe edit is the
 * point of that mode and every edit can be reverted. Restructure keeps a low bar. Restructure and creative
 * add headings and length on purpose, so their verbosity ceiling is looser. Intent stays at 0.7 everywhere.
 */
export const GATE_BY_MODE: Record<OptimizationMode, GateThresholds> = {
  minimal: { intentPreserved: 0.7, overEngineered: 0.4, maxInvented: 0.4, minImprovement: 0 },
  structured: { intentPreserved: 0.7, overEngineered: 0.55, maxInvented: 0.4, minImprovement: 0.2 },
  creative: { intentPreserved: 0.7, overEngineered: 0.55, maxInvented: 0.65, minImprovement: 0.35 },
};

/** Image and video rewrites add visual craft by design, so they keep the earlier, wider ceiling. */
const VISUAL_INVENTED_BASE: Record<OptimizationMode, number> = { minimal: 0.5, structured: 0.5, creative: 0.65 };

export function maxInventedFor(mode: OptimizationMode, visual: boolean): number {
  return visual ? Math.min(0.75, VISUAL_INVENTED_BASE[mode] + 0.15) : GATE_BY_MODE[mode].maxInvented;
}
