"use client";
import type { DiagnosticResult } from "@/lib/types";
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
    <section className="diagnostics" aria-label="Draft diagnostics">
      <div className="action-row">
        <h2>Draft diagnostics</h2>
        <button type="button" disabled={loading} onClick={onRefresh}>
          Recheck draft
        </button>
      </div>
      <p className="help" aria-live="polite">
        {loading
          ? "Checking current draft…"
          : diagnostics
            ? `${diagnostics.source === "local" ? "App-server heuristics, no AI-provider transmission" : diagnostics.source} · ${diagnostics.clarityLabel}. ${diagnostics.source === "local" ? "Your draft is sent to this app's server. Rule signals, not calibrated probabilities or a quality guarantee." : "Model-based rubric with app-server repair questions, not a downstream quality guarantee."}`
            : "Enter a draft to see questions worth resolving. Diagnosis sends the draft to this app's server; short, clear prompts are valid."}
      </p>
      {diagnostics?.fallback && (
        <p className="feedback">{diagnostics.fallback}</p>
      )}
      {diagnostics?.findings.map((finding) => (
        <div className="finding" key={finding.title}>
          <h3>{finding.title}</h3>
          <p>{finding.why}</p>
          <button onClick={() => onQuestion(finding.question)}>
            Answer: {finding.question}
          </button>
        </div>
      ))}
      {diagnostics && diagnostics.injectionRisk > 0.5 && (
        <p className="feedback">
          Security warning: possible instruction-override syntax. Review quoted
          or untrusted text boundaries; this is not a missing-context issue.
        </p>
      )}
      {diagnostics && (
        <details>
          <summary>Rubric details and strengths</summary>
          <p>
            Clarity: {diagnostics.clarityScore}/3. Scores describe this rubric,
            not execution quality.
          </p>
          <ul>
            {diagnostics.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
