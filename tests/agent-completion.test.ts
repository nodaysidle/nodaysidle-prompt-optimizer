import { describe, expect, it } from "vitest";
import { AUDIT_ADDITIONS, completeAuditTask, isAuditTask } from "@/lib/agent-completion";
import type { OptimizationResult } from "@/lib/types";

const base = (optimized: string): OptimizationResult => ({
  optimized,
  summary: "x",
  changes: [],
  assumptions: [],
  warnings: [],
  unresolvedQuestions: ["Should the audit be read-only, or may files be edited?", "What should it cover?"],
  rejectedDraft: { optimized: "r", reason: "failed", problems: [] } as never,
});

describe("audit task completion", () => {
  it("recognises an audit of a repo path", () => {
    expect(isAuditTask("make an audit of the repo in /home/arch/dev/x/ and show me your findings")).toBe(true);
    expect(isAuditTask("review my code in the api folder")).toBe(true);
  });
  it("does not treat edit tasks or already read-only prompts as audits", () => {
    expect(isAuditTask("audit the repo and fix the bugs")).toBe(false);
    expect(isAuditTask("audit the repo, read-only")).toBe(false);
    expect(isAuditTask("write a cold email")).toBe(false);
  });
  it("appends each addition as its own requirement and assumption", () => {
    const out = completeAuditTask(base("Audit the repository at /x/y/ and report your findings."));
    expect(out.optimized.startsWith("Audit the repository at /x/y/ and report your findings.")).toBe(true);
    for (const line of AUDIT_ADDITIONS) expect(out.optimized).toContain(`- ${line}`);
    expect(out.assumptions).toEqual([...AUDIT_ADDITIONS]);
    expect(out.rejectedDraft).toBeUndefined();
    expect(out.unresolvedQuestions).toEqual(["What should it cover?"]);
  });
});
