/**
 * Pure helpers to compare two eval runs (run-eval.ts or judge.ts `--out` files).
 * No imports and no side effects, so tests and both scripts can load it directly.
 */

export interface EvalRow {
  seed: string;
  kind: string;
  /** "pass" | "fail" | "error" for run-eval; judge.ts rows leave it undefined. */
  outcome?: "pass" | "fail" | "error";
  /** True when the app returned the user's original instead of a rewrite. */
  kept: boolean;
  /** Why it was kept: "failed" (verification) or "marginal" (not clearly better). */
  keptReason?: "failed" | "marginal";
  /** judge.ts only: who won the pairwise comparison. */
  better?: "rewrite" | "original" | "tie";
}

export interface RowChange {
  seed: string;
  field: "outcome" | "kept" | "better" | "added" | "removed";
  before: string;
  after: string;
}

const keptLabel = (row: EvalRow) => (row.kept ? "kept" : "rewritten");

/** Seeds whose result differs between two runs, in the order of `current`. */
export function compareRuns(baseline: readonly EvalRow[], current: readonly EvalRow[]): RowChange[] {
  const before = new Map(baseline.map((row) => [row.seed, row]));
  const currentSeeds = new Set(current.map((row) => row.seed));
  const changes: RowChange[] = [];

  for (const row of current) {
    const old = before.get(row.seed);
    if (!old) {
      changes.push({ seed: row.seed, field: "added", before: "", after: keptLabel(row) });
      continue;
    }
    for (const field of ["outcome", "kept", "better"] as const) {
      const a = field === "kept" ? keptLabel(old) : old[field];
      const b = field === "kept" ? keptLabel(row) : row[field];
      if (a === b) continue;
      changes.push({ seed: row.seed, field, before: a ?? "", after: b ?? "" });
    }
  }

  for (const row of baseline) {
    if (!currentSeeds.has(row.seed)) changes.push({ seed: row.seed, field: "removed", before: keptLabel(row), after: "" });
  }
  return changes;
}

/** One line per change, or a single "No changes against the baseline." line. */
export function formatChanges(changes: readonly RowChange[]): string {
  if (changes.length === 0) return "No changes against the baseline.";
  return changes
    .map((c) => {
      if (c.field === "added") return `- ${c.seed}: new seed (${c.after})`;
      if (c.field === "removed") return `- ${c.seed}: no longer run (was ${c.before})`;
      return `- ${c.seed}: ${c.field} ${c.before || "none"} -> ${c.after || "none"}`;
    })
    .join("\n");
}

/** Count of kept originals, split by reason. */
export function keptCounts(rows: readonly EvalRow[]): { kept: number; failed: number; marginal: number; total: number } {
  const kept = rows.filter((row) => row.kept);
  return {
    kept: kept.length,
    failed: kept.filter((row) => row.keptReason === "failed").length,
    marginal: kept.filter((row) => row.keptReason === "marginal").length,
    total: rows.length,
  };
}
