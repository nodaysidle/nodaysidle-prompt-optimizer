import { describe, expect, it } from "vitest";
import { mapDiagnosticAnswers } from "@/lib/decisions";

describe("mapDiagnosticAnswers kind routing", () => {
  const factory = (answers: Record<string, unknown>) =>
    answers as unknown as Record<string, { noul?: number; score?: number; choice?: string } | undefined>;

  it("does not raise persona issues for user prompts", () => {
    const result = mapDiagnosticAnswers(
      factory({ clarity: { score: 2 }, is_ambiguous: { noul: 0.1 }, lacks_constraints: { noul: 0.1 }, lacks_role: { noul: 0.95 } }),
      { kind: "user", engine: "test-engine" },
    );
    expect(result.issues.some((i) => i.toLowerCase().includes("persona"))).toBe(false);
  });

  it("raises persona issues for system prompts when asked", () => {
    const result = mapDiagnosticAnswers(
      factory({ clarity: { score: 2 }, lacks_role: { noul: 0.95 }, conflicting_instructions: { noul: 0.9 } }),
      { kind: "system", engine: "test-engine" },
    );
    expect(result.issues.some((i) => i.toLowerCase().includes("persona"))).toBe(true);
    expect(result.issues.some((i) => i.toLowerCase().includes("conflict"))).toBe(true);
    expect(result.unresolvedQuestions?.some((q) => q.toLowerCase().includes("precedence") || q.toLowerCase().includes("wins"))).toBe(true);
  });

  it("leaves video camera issues out of answers that were never asked", () => {
    const result = mapDiagnosticAnswers(
      factory({ clarity: { score: 2 }, lacks_camera_movement: { noul: 0.9 } }),
      { kind: "user", engine: "test-engine" },
    );
    expect(result.issues.some((i) => i.toLowerCase().includes("camera"))).toBe(false);
    expect(result.lacksCameraMovement).toBeUndefined();
  });

  it("marks heuristic engines as heuristic", () => {
    const result = mapDiagnosticAnswers(undefined, {
      kind: "user",
      engine: "heuristic",
      heuristic: true,
    });
    expect(result.heuristic).toBe(true);
    expect(result.engine).toContain("heuristic");
  });

  it("never fabricates a passing gate", () => {
    const heuristics = mapDiagnosticAnswers(undefined, { kind: "system", engine: "heuristic", heuristic: true });
    expect(heuristics.heuristic).toBe(true);
  });
});
