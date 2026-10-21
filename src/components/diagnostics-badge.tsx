"use client";
import type { DiagnosticResult } from "@/lib/types";

/** What the diagnostic model (or the rule-based fallback) said about the current draft. */
export function DiagnosticsPanel({
  diagnostics,
  loading,
  onRefresh,
  onQuestion,
}: {
  diagnostics: DiagnosticResult | null;
  loading?: boolean;
  onRefresh: () => void;
  onQuestion: (question: string) => void;
}) {
  return (
    <section className="read" aria-label="Read of your draft">
      <div className="read-head">
        <h2>Read of your draft</h2>
        <button type="button" disabled={loading} onClick={onRefresh}>
          {loading ? "Reading" : "Read again"}
        </button>
      </div>
      <p className="help" aria-live="polite">
        {loading
          ? "Reading your draft."
          : diagnostics
            ? `${diagnostics.clarityLabel}. ${
                diagnostics.heuristic
                  ? "Rule-based estimate, no model was consulted."
                  : `Judged by ${diagnostics.engine ?? "the diagnostic model"}.`
              }`
            : "Type a draft and it is read here. Short, clear prompts are valid and may need nothing."}
      </p>
      {diagnostics && diagnostics.issues.length > 0 && (
        <ul className="read-list">
          {diagnostics.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {diagnostics?.unresolvedQuestions?.map((question) => (
        <p className="read-question" key={question}>
          <span>{question}</span>
          <button type="button" onClick={() => onQuestion(question)}>
            Answer this
          </button>
        </p>
      ))}
    </section>
  );
}
