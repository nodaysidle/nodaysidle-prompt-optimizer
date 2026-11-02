"use client";
import { useEffect, useId, useRef } from "react";
export function Dialog({
  title,
  onClose,
  beforeClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Optional guard for Close and Escape. Returning false keeps the dialog open. */
  beforeClose?: () => boolean;
  /** Kept outside the scrolling body so Save never scrolls away. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      focused?.focus();
    };
  }, []);
  function requestClose() {
    if (beforeClose && !beforeClose()) return;
    onClose();
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      aria-modal="true"
      className="workbench-dialog"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, summary, [tabindex='0']",
          ),
        ).filter(
          (element) =>
            !element.hasAttribute("disabled") &&
            element.getClientRects().length > 0,
        );
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button type="button" onClick={requestClose} aria-label={`Close ${title}`}>
          Close
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </dialog>
  );
}
