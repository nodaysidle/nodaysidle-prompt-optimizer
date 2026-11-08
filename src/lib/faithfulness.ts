import type { OptimizationMode, PromptKind } from "./types";

interface Addition {
  label: string;
  appears: RegExp;
  assumed: RegExp;
}

const ADDITIONS: Addition[] = [
  { label: "a read-only rule", appears: /\bread-only\b|\bdo not (?:modify|edit)\b|\bwithout (?:editing|modifying)\b/i, assumed: /read-only|edit|modif/i },
  { label: "an evidence rule", appears: /\bcite\b[^.\n]*\b(?:file|line|path)|\bevidence\b/i, assumed: /evidence|cite|citation/i },
  { label: "a stop condition", appears: /\bstop (?:and report|when|if)\b/i, assumed: /stop/i },
  { label: "a report format", appears: /\branked by severity\b|\bnot-verified\b|\bnot verified\b/i, assumed: /report|format|severity|verified/i },
  { label: "a no-new-dependencies rule", appears: /\bno new dependenc|\bnever force-push\b/i, assumed: /dependenc|force/i },
  { label: "a commit step", appears: /\bcommit\b/i, assumed: /commit/i },
];

const FAITHFUL_FORBIDDEN: { label: string; re: RegExp }[] = [
  { label: "a read-only or do-not-modify rule", re: /\bread-only\b|\bdo not (?:modify|edit)\b/i },
  { label: "an Assumptions block", re: /^#{1,3}\s*assumptions\b|^assumptions:/im },
  { label: "a Workflow block", re: /^#{1,3}\s*workflow\b|^workflow:/im },
  { label: "a stop condition", re: /\bstop and report\b/i },
  { label: "an evidence rule", re: /\bcite\b[^.\n]*\b(?:file|line|path)/i },
  { label: "a readiness claim", re: /\bready[- ]to[- ]send\b/i },
];

const PATH_RE = /(?:~|\.{0,2})?\/[\w.\-]+(?:\/[\w.\-]+)+\/?/g;

function fullyOutsideCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

export function findFaithfulnessViolations(
  original: string,
  optimized: string,
  mode: OptimizationMode,
  kind: PromptKind,
  assumptions: readonly string[] = [],
): string[] {
  if (kind !== "user" && kind !== "system") return [];
  const out: string[] = [];
  const source = fullyOutsideCode(original);
  const result = fullyOutsideCode(optimized);

  for (const path of source.match(PATH_RE) ?? []) {
    if (!result.includes(path)) out.push(`the path ${path} was changed or removed`);
  }

  if (/\bfocus(?:ing)? on\b/i.test(source) && !/\bonly\b/i.test(source)) {
    if (/\bonly\b[^.\n]{0,30}\b(?:folder|directory|module|page|file)\b/i.test(result))
      out.push('"focus on" was narrowed to "only"');
  }

  const newWordLimit = result.match(/\b\d+\s*(?:words?|characters?|sentences?)\b/i);
  if (newWordLimit && !new RegExp(newWordLimit[0].replace(/\s+/g, "\\s*"), "i").test(source) && mode !== "creative")
    out.push(`a limit the user did not write was added: "${newWordLimit[0]}"`);

  if (mode !== "creative") {
    for (const { label, re } of FAITHFUL_FORBIDDEN) {
      if (re.test(result) && !re.test(source)) out.push(`added ${label} in a mode that must stay faithful`);
    }
    return out;
  }

  const listed = assumptions.join("\n");
  for (const { label, appears, assumed } of ADDITIONS) {
    if (appears.test(result) && !appears.test(source) && !assumed.test(listed))
      out.push(`added ${label} without listing it as an assumption`);
  }
  if (/\bread-only\b/i.test(result) && /\brun (?:the )?existing (?:checks|tests)\b/i.test(result) && !/\bwrite no files\b|\bonly checks that\b/i.test(result))
    out.push("a read-only task also asks to run checks that may write files");
  return out;
}
