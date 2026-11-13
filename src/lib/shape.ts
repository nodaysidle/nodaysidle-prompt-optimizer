import type { OptimizationMode, PromptKind } from "./types";

interface Section {
  heading: string;
  text: string;
}

// wordsOnly: licensed by the trigger words alone, since restating other sections is not a success condition.
const UNLICENSED: { heading: RegExp; licensedBy: RegExp; wordsOnly?: true }[] = [
  { heading: /^context$/i, licensedBy: /\b(?:context|background)\b/i },
  { heading: /^deliverables?$/i, licensedBy: /\bdeliver|\boutput\b|\bformat\b/i },
  { heading: /^done when$/i, licensedBy: /\bdone when\b|\bsuccess\b|\buntil\b/i, wordsOnly: true },
  { heading: /^workflow$/i, licensedBy: /\bstep|\bworkflow\b|\bfirst\b.*\bthen\b/i },
  { heading: /^evidence$/i, licensedBy: /\bevidence\b|\bcite\b|\bproof\b/i },
  { heading: /^assumptions$/i, licensedBy: /\bassum/i },
];

const HEADING_RE = /^#{1,3}\s*(.+?)\s*$/;
// Share of a section body's tokens that must come from the user's prompt for it to count as theirs.
const GROUNDED_SHARE = 0.6;

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => /\d/.test(t) || t.length >= 4),
  );
}

function isGrounded(body: string, sourceTokens: Set<string>): boolean {
  const own = tokens(body);
  if (own.size < 2) return false;
  let hits = 0;
  for (const t of own) if (sourceTokens.has(t)) hits++;
  return hits / own.size >= GROUNDED_SHARE;
}
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
 * A section whose content mostly repeats the user's own words is licensed too, except Done when.
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
  const sourceTokens = tokens(source);

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
    const drop =
      rule &&
      (isAssumptions
        ? true
        : mode !== "creative" &&
          !rule.licensedBy.test(source) &&
          (rule.wordsOnly || !isGrounded(section.text.split("\n").slice(1).join("\n"), sourceTokens)));
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

/** The model wrote its summary and change list before shaping, so drop what describes a removed section. */
export function dropMentionsOfRemoved(
  removed: readonly string[],
  summary: string,
  changes: readonly string[],
): { summary: string; changes: string[] } {
  if (removed.length === 0) return { summary, changes: [...changes] };
  const mentions = removed.map(
    (heading) => new RegExp(`\\b${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i"),
  );
  const mentionsRemoved = (text: string) => mentions.some((re) => re.test(text));
  return {
    summary: summary
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !mentionsRemoved(sentence))
      .join(" ")
      .trim(),
    changes: changes.filter((change) => !mentionsRemoved(change)),
  };
}

// Share of a bullet's tokens one earlier line must hold for the bullet to count as a restatement.
const REPEAT_SHARE = 0.8;
const NEGATION_RE = /\b(?:not|no|never|without|cannot)\b|n['’]t\b/i;
const BULLET_RE = /^\s*(?:[-*]|\d+\.)\s+(.+)$/;

function stemmedTokens(text: string): Set<string> {
  return new Set([...tokens(text)].map((t) => (t.length > 4 ? t.replace(/s$/, "") : t)));
}

function restates(bullet: string, own: Set<string>, earlier: { text: string; tokens: Set<string> }): boolean {
  if (NEGATION_RE.test(bullet) && !NEGATION_RE.test(earlier.text)) return false;
  let hits = 0;
  for (const t of own) {
    if (earlier.tokens.has(t)) hits++;
    else if (/\d/.test(t)) return false;
  }
  return hits / own.size >= REPEAT_SHARE;
}

/** Removes brief bullets that only restate an earlier line; returns headings of sections left empty. */
export function dropRepeatedBriefItems(optimized: string): { optimized: string; removed: string[] } {
  if (optimized.includes("```")) return { optimized, removed: [] };
  const { lead, sections } = splitSections(optimized);
  const earlier: { text: string; tokens: Set<string> }[] = [];
  const removed: string[] = [];
  let dropped = false;

  const keepLines = (lines: string[], isProtected: boolean): string[] =>
    lines.filter((line) => {
      const bullet = BULLET_RE.exec(line);
      if (!bullet) {
        for (const sentence of line.split(/(?<=[.!?])\s+/))
          if (sentence.trim()) earlier.push({ text: sentence, tokens: stemmedTokens(sentence) });
        return true;
      }
      const own = stemmedTokens(bullet[1]);
      if (!isProtected && own.size >= 2 && earlier.some((item) => restates(bullet[1], own, item))) {
        dropped = true;
        return false;
      }
      earlier.push({ text: bullet[1], tokens: own });
      return true;
    });

  const out = [keepLines(lead.split("\n"), false).join("\n")];
  for (const section of sections) {
    const [headingLine, ...body] = section.text.split("\n");
    // Hard limits stay explicit and workflow steps carry order, so neither is ever dropped.
    const kept = keepLines(body, /^(?:constraints?|workflow)$/i.test(section.heading));
    const emptied = kept.length < body.length && !kept.some((line) => line.trim());
    if (emptied) removed.push(section.heading);
    else out.push([headingLine, ...kept].join("\n"));
  }
  if (!dropped) return { optimized, removed: [] };
  return { optimized: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
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
