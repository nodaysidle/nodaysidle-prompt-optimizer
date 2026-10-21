"use client";
import { useRef } from "react";
import type { Segment } from "@/lib/redline";

/**
 * The rewrite shown as edits to the user's own text. Unchanged stretches read as plain
 * prose; each edit is its own block with a real button to keep or revert it.
 * Keyboard: j and k move between edits, space or enter flips the focused one.
 */
export function RedlineView({
  segments,
  reverted,
  locked,
  onToggle,
}: {
  segments: Segment[];
  reverted: ReadonlySet<number>;
  /** True once the final text has been edited by hand, so the toggles no longer apply. */
  locked: boolean;
  onToggle: (id: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const total = segments.filter((segment) => segment.kind === "edit").length;

  function move(event: React.KeyboardEvent, step: 1 | -1) {
    const buttons = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("[data-edit-toggle]") ?? [],
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[at === -1 ? (step === 1 ? 0 : buttons.length - 1) : at + step];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  return (
    <div
      ref={root}
      className="redline"
      onKeyDown={(event) => {
        if (event.target instanceof HTMLTextAreaElement) return;
        if (event.key === "j") move(event, 1);
        if (event.key === "k") move(event, -1);
      }}
    >
      {segments.map((segment, index) => {
        if (segment.kind === "same") {
          return (
            <p className="redline-same" key={`same-${index}`}>
              {segment.text}
            </p>
          );
        }
        const isReverted = reverted.has(segment.id);
        return (
          <section
            className="edit"
            data-state={isReverted ? "reverted" : "kept"}
            key={segment.id}
            aria-label={`Edit ${segment.id + 1} of ${total}`}
          >
            <p className="edit-title">
              Edit {segment.id + 1} of {total}
              <span>{isReverted ? "Reverted" : "Kept"}</span>
            </p>
            {segment.removed.trim() && (
              <p className="edit-line">
                <span className="edit-tag">{segment.added.trim() ? "Was" : "Removed"}</span>
                <span className={isReverted ? "edit-text" : "edit-text edit-struck"}>
                  {segment.removed.trim()}
                </span>
              </p>
            )}
            {segment.added.trim() && (
              <p className="edit-line">
                <span className="edit-tag">{segment.removed.trim() ? "Now" : "Added"}</span>
                <span className={isReverted ? "edit-text edit-struck" : "edit-text"}>
                  {segment.added.trim()}
                </span>
              </p>
            )}
            <button
              type="button"
              data-edit-toggle
              disabled={locked}
              aria-pressed={isReverted}
              onClick={() => onToggle(segment.id)}
            >
              {isReverted ? "Keep this edit" : "Revert this edit"}
            </button>
          </section>
        );
      })}
    </div>
  );
}
