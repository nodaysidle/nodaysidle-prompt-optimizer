import type { OptimizationResult } from "./types";

/**
 * How far the result can be trusted, in words the interface can state plainly.
 * - kept: verification rejected the rewrite (or it was not clearly better), so the original is returned.
 * - checked: the judge model and the deterministic checks both passed.
 * - review: the judge or a deterministic check flagged something; the user decides.
 * - unchecked: no judge model was available, only the deterministic checks ran.
 */
export type Verdict = "kept" | "checked" | "review" | "unchecked";

export function verdictOf(result: OptimizationResult): Verdict {
  if (result.rejectedDraft) return "kept";
  if (!result.qualityGate) return "unchecked";
  return result.qualityGate.passed && result.warnings.length === 0 ? "checked" : "review";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  kept: "Original kept",
  checked: "Checked",
  review: "Needs your review",
  unchecked: "Not independently checked",
};
