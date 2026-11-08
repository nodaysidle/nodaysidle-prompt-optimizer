import type { OptimizationMode, PromptKind } from "./types";

interface Section {
  heading: string;
  text: string;
}

const UNLICENSED: { heading: RegExp; licensedBy: RegExp }[] = [
  { heading: /^context$/i, licensedBy: /\b(?:context|background)\b/i },
  { heading: /^deliverables?$/i, licensedBy: /\bdeliver|\boutput\b|\bformat\b/i },
  { heading: /^done when$/i, licensedBy: /\bdone when\b|\bsuccess\b|\buntil\b/i },
  { heading: /^workflow$/i, licensedBy: /\bstep|\bworkflow\b|\bfirst\b.*\bthen\b/i },
  { heading: /^evidence$/i, licensedBy: /\bevidence\b|\bcite\b|\bproof\b/i },
  { heading: /^assumptions$/i, licensedBy: /\bassum/i },
];

const HEADING_RE = /^#{1,3}\s*(.+?)\s*$/;
const ASSUMPTIONS_LABEL_RE = /^assumptions:\s*$/i;

function splitSections(text: string): { lead: string; sections: Section[] } {
  const lines = text.split("\n");
  const lead: string[] = [];
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      current = { heading: match[1].replace(/:$/, ""), text: line };
      sections.push(current);
    } else if (current) {
      current.text += `\n${line}`;
    } else {
      lead.push(line);
    }
  }
  return { lead: lead.join("\n"), sections };
}

export interface ShapedRewrite {
  optimized: string;
  assumptions: string[];
  removed: string[];
}

/**
 * Enforces by code what the rewriter is only asked to do in words: in Light edit and Restructure a
 * text prompt gets no Context, Deliverables, Done when, Workflow, Evidence or Assumptions block the
 * user's own words did not license, and Allow additions keeps its assumptions in the assumptions
 * list; its in-body block is kept, relabelled Requirements, because the agent only sees the body.
 */
export function enforceFaithfulShape(
  original: string,
  optimized: string,
  mode: OptimizationMode,
  kind: PromptKind,
  assumptions: readonly string[],
): ShapedRewrite {
  if (kind !== "user" && kind !== "system") return { optimized, assumptions: [...assumptions], removed: [] };
  const removed: string[] = [];
  const renamed: string[] = [];
  const kept = [...assumptions];
  const source = original.replace(/```[\s\S]*?```/g, "");

  const { lead, sections } = splitSections(optimized);
  const out: string[] = lead.trim() ? [lead.trimEnd()] : [];
  for (const section of sections) {
    const rule = UNLICENSED.find((r) => r.heading.test(section.heading));
    const isAssumptions = rule?.heading.test("assumptions");
    if (isAssumptions && mode === "creative") {
      const bullets = section.text.split("\n").slice(1).flatMap((line) => {
        const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
        return bullet ? [bullet[1].trim()] : [];
      });
      if (kept.length === 0) kept.push(...bullets);
      out.push(section.text.replace(HEADING_RE, "## Requirements").trimEnd());
      renamed.push(section.heading);
      continue;
    }
    const drop = rule && (isAssumptions ? true : mode !== "creative" && !rule.licensedBy.test(source));
    if (!drop) {
      out.push(section.text.trimEnd());
      continue;
    }
    removed.push(section.heading);
    if (isAssumptions && kept.length === 0) {
      for (const line of section.text.split("\n").slice(1)) {
        const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
        if (bullet) kept.push(bullet[1].trim());
      }
    }
  }

  let text = out.join("\n\n");
  const labelled = text.split("\n");
  const at = labelled.findIndex((l) => ASSUMPTIONS_LABEL_RE.test(l.trim()));
  if (at >= 0 && mode === "creative") {
    renamed.push("Assumptions");
    const block: string[] = [];
    for (const line of labelled.slice(at + 1)) {
      if (/^\s*[-*]\s+/.test(line) || !line.trim()) block.push(line);
      else break;
    }
    if (kept.length === 0)
      for (const line of block) {
        const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
        if (bullet) kept.push(bullet[1].trim());
      }
    labelled[at] = "Requirements:";
    text = labelled.join("\n");
  } else if (at >= 0) {
    removed.push("Assumptions");
    const tail = labelled.slice(at + 1);
    const block: string[] = [];
    while (tail.length && (/^\s*[-*]\s+/.test(tail[0]) || !tail[0].trim())) block.push(tail.shift() as string);
    if (kept.length === 0)
      for (const line of block) {
        const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
        if (bullet) kept.push(bullet[1].trim());
      }
    text = [...labelled.slice(0, at), ...tail].join("\n");
  }

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return removed.length === 0 && renamed.length === 0
    ? { optimized, assumptions: [...assumptions], removed: [] }
    : !text
      ? { optimized, assumptions: [...assumptions], removed: [] }
      : { optimized: text, assumptions: kept, removed: [...removed, ...renamed] };
}

const GENERIC_QUESTION_RE = /^what (?:result )?(?:counts as|is) (?:a )?success/i;
const STOP_WORDS = new Set(["the", "a", "an", "or", "and", "of", "to", "be", "is", "it", "should", "this", "that", "for", "in", "on", "may", "any", "do", "does", "which", "what", "are", "you", "your", "my", "i", "only"]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, "") : w)),
  );
}

/**
 * A question is dropped when it is the generic "what counts as success" boilerplate, or when the
 * prompt already states the answer as a listed assumption, so the user is never asked about
 * something the output asserts.
 */
export function tidyQuestions(questions: readonly string[], assumptions: readonly string[]): string[] {
  const assumed = assumptions.map(contentWords);
  return questions.filter((question) => {
    if (GENERIC_QUESTION_RE.test(question.trim())) return false;
    const words = contentWords(question);
    if (words.size === 0) return true;
    return !assumed.some((set) => {
      let shared = 0;
      for (const w of words) if (set.has(w)) shared++;
      return shared >= 2 && shared / words.size >= 0.5;
    });
  });
}
