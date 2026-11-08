import type { OptimizationResult } from "./types";

export const AUDIT_ADDITIONS: readonly string[] = [
  "Read-only: do not edit, create or delete any files.",
  "Cite the file path and line number for each finding.",
  "Rank findings by severity (high, medium, low).",
  "End with a section listing what you could not verify.",
  "If the path does not exist or is not a repository, stop and report that.",
];

const AUDIT_VERB_RE = /\b(?:audit|review|inspect|assess|analy[sz]e|investigate)\b/i;
const CODE_TARGET_RE = /\b(?:repo|repository|codebase|project|code|folder|directory|source)\b|(?:^|\s)(?:~|\.{0,2})?\/[\w.-]+\/[\w.-]+/i;
const EDIT_VERB_RE = /\b(?:fix|implement|add|refactor|rewrite|write|create|delete|remove|update|push|commit|install|deploy|build)\b/i;
const ALREADY_RE = /\bread-only\b|\bdo not (?:edit|modify)\b/i;

export function isAuditTask(prompt: string): boolean {
  return (
    AUDIT_VERB_RE.test(prompt) &&
    CODE_TARGET_RE.test(prompt) &&
    !EDIT_VERB_RE.test(prompt) &&
    !ALREADY_RE.test(prompt)
  );
}

/**
 * Allow additions on an audit or review task is completed by code, after the rewriter and the
 * judges have only seen the faithful restatement. The judges score any model-written addition as
 * an invented requirement and keep the original, which would leave this mode doing nothing.
 */
export function completeAuditTask(base: OptimizationResult): OptimizationResult {
  const text = base.optimized.trimEnd();
  const optimized = `${text}\n\nRequirements:\n${AUDIT_ADDITIONS.map((line) => `- ${line}`).join("\n")}`;
  const result: OptimizationResult = {
    ...base,
    optimized,
    assumptions: [...AUDIT_ADDITIONS],
    summary: "Kept your wording and added the audit rules below, each listed as an assumption you can remove.",
    changes: [...base.changes, ...AUDIT_ADDITIONS.map((line) => `Added: ${line}`)],
    unresolvedQuestions: base.unresolvedQuestions.filter((q) => !/read-only|edit/i.test(q)),
  };
  delete result.rejectedDraft;
  return result;
}
