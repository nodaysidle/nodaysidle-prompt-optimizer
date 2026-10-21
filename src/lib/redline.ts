import { diffArrays } from "diff";

/** A stretch of text that is identical in both versions. */
export interface SameSegment {
  kind: "same";
  text: string;
}
/** One edit: what the original said and what the rewrite says instead. Either side can be empty. */
export interface EditSegment {
  kind: "edit";
  id: number;
  removed: string;
  added: string;
}
export type Segment = SameSegment | EditSegment;

/**
 * Splits text into sentence and line units, each keeping its trailing whitespace,
 * so that joining the units gives back exactly the input.
 * Sentence or line is the smallest unit a person can sensibly keep or revert.
 */
export function toUnits(text: string): string[] {
  return text.match(/[^\n]*?(?:[.!?]+(?=\s|$)|\n|$)\s*/g)?.filter(Boolean) ?? [];
}

/**
 * Compares the original with the rewrite and returns alternating identical stretches
 * and edits. Adjacent removals and additions become one edit, because a reworded
 * sentence is one decision, not two.
 */
export function buildRedline(original: string, optimized: string): Segment[] {
  // Units match when they say the same thing; a differing trailing space is not a change.
  const parts = diffArrays(toUnits(original), toUnits(optimized), {
    comparator: (left, right) => left.trim() === right.trim(),
  });
  const segments: Segment[] = [];
  let nextId = 0;
  const pending = { removed: "", added: "", open: false };

  const flush = () => {
    if (!pending.open) return;
    // A change in whitespace alone is not an edit worth a decision.
    if (pending.removed.trim() === pending.added.trim()) {
      segments.push({ kind: "same", text: pending.added });
    } else {
      segments.push({ kind: "edit", id: nextId++, removed: pending.removed, added: pending.added });
    }
    pending.removed = "";
    pending.added = "";
    pending.open = false;
  };

  for (const part of parts) {
    const text = part.value.join("");
    if (part.added) {
      pending.added += text;
      pending.open = true;
    } else if (part.removed) {
      pending.removed += text;
      pending.open = true;
    } else {
      flush();
      segments.push({ kind: "same", text });
    }
  }
  flush();
  return mergeSame(segments);
}

function mergeSame(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (segment.kind === "same" && last?.kind === "same") last.text += segment.text;
    else merged.push({ ...segment });
  }
  return merged;
}

/** The text that results from keeping every edit except the ones listed as reverted. */
export function assemble(segments: Segment[], reverted: ReadonlySet<number>): string {
  return segments
    .map((segment) => {
      if (segment.kind === "same") return segment.text;
      return reverted.has(segment.id) ? segment.removed : segment.added;
    })
    .join("");
}

export function editsOf(segments: Segment[]): EditSegment[] {
  return segments.filter((segment): segment is EditSegment => segment.kind === "edit");
}
