import { describe, expect, it } from "vitest";
import { compareRuns, formatChanges, keptCounts, type EvalRow } from "../evals/compare";

const row = (seed: string, extra: Partial<EvalRow> = {}): EvalRow => ({ seed, kind: "user", kept: false, ...extra });

describe("compareRuns", () => {
  it("returns no changes for identical runs", () => {
    const run = [row("a", { outcome: "pass" }), row("b", { outcome: "fail", kept: true, keptReason: "failed" })];
    expect(compareRuns(run, run.map((r) => ({ ...r })))).toEqual([]);
  });

  it("reports a seed that goes from rewritten to kept", () => {
    expect(compareRuns([row("a", { outcome: "pass" })], [row("a", { outcome: "pass", kept: true, keptReason: "marginal" })])).toEqual([
      { seed: "a", field: "kept", before: "rewritten", after: "kept" },
    ]);
  });

  it("reports pass to fail", () => {
    expect(compareRuns([row("a", { outcome: "pass" })], [row("a", { outcome: "fail" })])).toEqual([
      { seed: "a", field: "outcome", before: "pass", after: "fail" },
    ]);
  });

  it("reports a rewrite win that became a tie", () => {
    expect(compareRuns([row("a", { better: "rewrite" })], [row("a", { better: "tie" })])).toEqual([
      { seed: "a", field: "better", before: "rewrite", after: "tie" },
    ]);
  });

  it("reports an added seed once", () => {
    expect(compareRuns([row("a")], [row("a"), row("b", { kept: true })])).toEqual([
      { seed: "b", field: "added", before: "", after: "kept" },
    ]);
  });

  it("reports a removed seed once", () => {
    expect(compareRuns([row("a"), row("b")], [row("a")])).toEqual([
      { seed: "b", field: "removed", before: "rewritten", after: "" },
    ]);
  });

  it("emits one change per differing field, in the order of the current run", () => {
    const baseline = [row("a", { outcome: "pass" }), row("b", { outcome: "pass", better: "rewrite" })];
    const current = [row("b", { outcome: "fail", kept: true, better: "tie" }), row("a", { outcome: "pass" })];
    expect(compareRuns(baseline, current)).toEqual([
      { seed: "b", field: "outcome", before: "pass", after: "fail" },
      { seed: "b", field: "kept", before: "rewritten", after: "kept" },
      { seed: "b", field: "better", before: "rewrite", after: "tie" },
    ]);
  });
});

describe("keptCounts", () => {
  it("splits kept originals by reason", () => {
    const rows = [
      row("a", { kept: true, keptReason: "failed" }),
      row("b", { kept: true, keptReason: "marginal" }),
      row("c", { kept: true, keptReason: "marginal" }),
      row("d", { kept: true }),
      row("e"),
    ];
    expect(keptCounts(rows)).toEqual({ kept: 4, failed: 1, marginal: 2, total: 5 });
  });
});

describe("formatChanges", () => {
  it("returns the no-changes line for an empty list", () => {
    expect(formatChanges([])).toBe("No changes against the baseline.");
  });

  it("prints one line per change", () => {
    const text = formatChanges([
      { seed: "a", field: "kept", before: "rewritten", after: "kept" },
      { seed: "b", field: "added", before: "", after: "rewritten" },
    ]);
    expect(text.split("\n")).toEqual(["- a: kept rewritten -> kept", "- b: new seed (rewritten)"]);
  });
});
