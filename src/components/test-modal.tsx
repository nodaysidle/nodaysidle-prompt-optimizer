"use client";
import { useEffect, useRef, useState } from "react";
import { useSettings, requestHeaders } from "@/lib/settings-context";
import type { CompletionResult, DraftSnapshot } from "@/lib/types";
import { Dialog } from "./dialog";

interface Evaluation {
  before: CompletionResult;
  after?: CompletionResult;
  config: {
    model: string;
    temperature: number;
    maxTokens: number;
    thinking: string;
    testInput: string;
    kind: string;
  };
}
function EvaluationContent({
  snapshot,
  candidate,
}: {
  snapshot: DraftSnapshot;
  candidate?: string;
}) {
  const { settings } = useSettings();
  const [sample, setSample] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  function invalidate() {
    sequence.current++;
    controller.current?.abort();
    setLoading(false);
    setResult(null);
    setError("");
  }
  async function run() {
    invalidate();
    const id = ++sequence.current;
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await fetch("/api/test-run", {
        method: "POST",
        headers: requestHeaders(settings),
        signal: current.signal,
        body: JSON.stringify({
          ...snapshot,
          candidate,
          testInput: sample,
          temperature,
          maxTokens,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evaluation failed.");
      if (sequence.current === id) setResult(data);
    } catch (e) {
      if (sequence.current === id && !current.signal.aborted)
        setError(e instanceof Error ? e.message : "Evaluation failed.");
    } finally {
      if (sequence.current === id) setLoading(false);
    }
  }
  return (
    <>
      <p className="help">
        {candidate
          ? "Two actual text completions, with identical model, temperature, output cap and scenario. Results vary between runs; this is not a quality score."
          : "One actual text completion using the selected prompt kind."}{" "}
        Sending this test may incur provider charges.
      </p>
      <p>
        Model: {snapshot.model} · thinking disabled · prompt kind:{" "}
        {snapshot.kind}
      </p>
      <details>
        <summary>Prompts under test</summary>
        <h3>Before</h3>
        <pre>{snapshot.prompt}</pre>
        {candidate && (
          <>
            <h3>After</h3>
            <pre>{candidate}</pre>
          </>
        )}
      </details>
      <label htmlFor="scenario">Identical scenario data for both prompts</label>
      <textarea
        id="scenario"
        maxLength={20000}
        value={sample}
        onChange={(e) => {
          invalidate();
          setSample(e.target.value);
        }}
      />
      <div className="control-grid">
        <div>
          <label htmlFor="temperature">Temperature</label>
          <input
            id="temperature"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => {
              invalidate();
              setTemperature(Number(e.target.value));
            }}
          />
        </div>
        <div>
          <label htmlFor="max-tokens">Maximum output tokens per side</label>
          <input
            id="max-tokens"
            type="number"
            min="64"
            max="4096"
            value={maxTokens}
            onChange={(e) => {
              invalidate();
              setMaxTokens(Number(e.target.value));
            }}
          />
        </div>
      </div>
      <button className="primary" onClick={run} disabled={loading}>
        {loading
          ? "Evaluating…"
          : candidate
            ? "Run paired text evaluation"
            : "Run single text test"}
      </button>
      <p role="status">
        {error || (!result && !loading ? "No evaluation run yet." : "")}
      </p>
      {result && (
        <>
          <p className="help">
            Returned configuration: {result.config.model} · temperature{" "}
            {result.config.temperature} · max {result.config.maxTokens} ·
            thinking {result.config.thinking}.{" "}
            {result.config.kind === "system"
              ? "System prompt plus user scenario."
              : "User prompt plus scenario data in user role."}
          </p>
          <div className="evaluation-grid">
            {[result.before, result.after].map((side, index) =>
              side ? (
                <section key={index}>
                  <h3>{index === 0 ? "Before output" : "After output"}</h3>
                  <pre>{side.content}</pre>
                  <p className="help">
                    {side.model} · {side.elapsedMs} ms
                    {side.usage
                      ? ` · ${side.usage.prompt_tokens} input / ${side.usage.completion_tokens} output / ${side.usage.total_tokens} total tokens`
                      : " · Usage not returned"}
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(side.content);
                        setError("Output copied.");
                      } catch {
                        setError(
                          "Clipboard unavailable. Select the output and copy manually.",
                        );
                      }
                    }}
                  >
                    Copy {index === 0 ? "before" : "after"} output
                  </button>
                </section>
              ) : null,
            )}
          </div>
        </>
      )}
    </>
  );
}
export function TestModal({
  open,
  onClose,
  snapshot,
  candidate,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: DraftSnapshot;
  candidate?: string;
}) {
  if (!open || snapshot.kind === "image" || snapshot.kind === "video")
    return null;
  return (
    <Dialog
      title={candidate ? "Paired text evaluation" : "Text test"}
      onClose={onClose}
    >
      <EvaluationContent
        key={JSON.stringify([snapshot, candidate])}
        snapshot={snapshot}
        candidate={candidate}
      />
    </Dialog>
  );
}
