"use client";
import { PROFILES } from "@/lib/profiles";
import type { DraftSnapshot, OptimizationResult } from "@/lib/types";

const GROUPS = [
  ["changes", "What changed"],
  ["assumptions", "Assumptions to confirm"],
  ["unresolvedQuestions", "Questions only you can answer"],
  ["warnings", "Worth a second look"],
] as const;

/** The model's own account of the rewrite, plus the record of how it was produced. */
export function ResultNotes({
  result,
  snapshot,
  onCopy,
}: {
  result: OptimizationResult;
  snapshot: DraftSnapshot;
  onCopy: (value: string) => void;
}) {
  const gate = result.qualityGate;
  const completion = result.completion;
  return (
    <section className="notes" aria-label="Notes on the rewrite">
      <h2>Why</h2>
      <p>{result.summary}</p>
      {GROUPS.map(([key, title]) =>
        result[key].length ? (
          <div key={key}>
            <h3>{title}</h3>
            <ul>
              {result[key].map((value, index) => (
                <li key={index}>{value}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {result.negativePrompt && (
        <div>
          <h3>Separate negative prompt for {PROFILES[snapshot.engineTarget].label}</h3>
          <pre>{result.negativePrompt}</pre>
          <button type="button" onClick={() => onCopy(result.negativePrompt || "")}>
            Copy negative prompt
          </button>
        </div>
      )}
      <details>
        <summary>How this was produced</summary>
        <dl className="record">
          <dt>Setting</dt>
          <dd>
            {snapshot.kind}, {snapshot.mode}, {PROFILES[snapshot.engineTarget].label}{" "}
            ({snapshot.profileVersion})
          </dd>
          {completion && (
            <>
              <dt>Model</dt>
              <dd>
                {completion.model}, {completion.elapsedMs} ms
                {completion.usage
                  ? `, ${completion.usage.prompt_tokens} tokens in, ${completion.usage.completion_tokens} out`
                  : ", usage not returned"}
              </dd>
            </>
          )}
          <dt>Check</dt>
          <dd>
            {gate
              ? `Intent kept ${Math.round(gate.intentPreserved * 100)}%, bloat ${Math.round(
                  gate.overEngineered * 100,
                )}%${
                  gate.improvement !== undefined
                    ? `, likely better ${Math.round(gate.improvement * 100)}%`
                    : ""
                } (${gate.judge ?? "judge model"}). These are model opinions, not guarantees.`
              : "No judge model was available. Only the built-in checks for quoted text, numbers, code and length ran."}
          </dd>
          {result.diagnostics && (
            <>
              <dt>Draft read</dt>
              <dd>
                {result.diagnostics.engine ?? "unknown"}, clarity{" "}
                {result.diagnostics.clarityScore} of 3
              </dd>
            </>
          )}
        </dl>
        {PROFILES[snapshot.engineTarget].sources.map((url) => (
          <p key={url}>
            <a href={url} target="_blank" rel="noreferrer">
              Source for this target profile
            </a>
          </p>
        ))}
      </details>
    </section>
  );
}
