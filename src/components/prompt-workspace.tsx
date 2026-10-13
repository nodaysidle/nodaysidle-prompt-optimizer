"use client";
import { useEffect, useRef, useState } from "react";
import { useSettings, requestHeaders } from "@/lib/settings-context";
import {
  MODES,
  PROMPT_KINDS,
  type AppSettings,
  type DiagnosticResult,
  type DraftSnapshot,
  type EngineTarget,
  type OptimizationMode,
  type OptimizationResult,
  type PromptHistoryItem,
  type PromptKind,
} from "@/lib/types";
import { PROFILES } from "@/lib/profiles";
import { PROMPT_EXAMPLES } from "@/lib/examples";
import { loadHistory, saveHistoryItem } from "@/lib/storage";
import {
  addReferencePhotoInstruction,
  composePresets,
  parsePresets,
} from "@/lib/presets";
import { BrandMark } from "./brand-mark";
import { SettingsPanel } from "./settings-panel";
import { HistoryDrawer } from "./history-drawer";
import { DiagnosticsPanel } from "./diagnostics-badge";
import { DiffViewer } from "./diff-viewer";
import { TestModal } from "./test-modal";

interface Candidate {
  result: OptimizationResult;
  snapshot: DraftSnapshot;
  text: string;
  historical?: boolean;
}
interface Draft {
  prompt: string;
  kind: PromptKind;
  mode: OptimizationMode;
  engineTarget: EngineTarget;
}
const EMPTY_DRAFT: Draft = {
  prompt: "",
  kind: "user",
  mode: "minimal",
  engineTarget: "universal",
};

async function requestDiagnostics(
  draft: Draft,
  settings: AppSettings,
  signal: AbortSignal,
): Promise<DiagnosticResult> {
  const response = await fetch("/api/diagnose", {
    method: "POST",
    headers: requestHeaders(settings),
    signal,
    body: JSON.stringify({
      prompt: draft.prompt,
      kind: draft.kind,
      diagnosticSource: settings.diagnosticSource,
      allowLocalFallback: settings.allowLocalFallback,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Diagnostics failed.");
  return data;
}

function candidateLabel(candidate: Candidate | null, stale: boolean): string {
  if (!candidate) return "No rewrite yet";
  if (stale) return "Stale or edited, review required";
  switch (candidate.result.qualityGate.state) {
    case "passed":
      return "Preservation check passed, not guaranteed";
    case "needsReview":
      return "Needs review";
    case "unavailable":
      return "Unverified";
  }
}
export function PromptWorkspace() {
  const { settings, server, error: settingsError } = useSettings();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [undo, setUndo] = useState<Draft | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<{
    data: DiagnosticResult | null;
    key: string;
  }>({ data: null, key: "" });
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [diagnosingKey, setDiagnosingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [diff, setDiff] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testDraft, setTestDraft] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const { ratio, lens } = parsePresets(draft.prompt);
  const diagnosticController = useRef<AbortController | null>(null);
  const diagnosticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimizeController = useRef<AbortController | null>(null);
  const diagnosticId = useRef(0);
  const optimizeId = useRef(0);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const snapshot: DraftSnapshot = {
    ...draft,
    profileVersion: PROFILES[draft.engineTarget].version,
    model: settings.deepseekModel,
  };
  const contextKey = JSON.stringify([draft, settings]);
  const diagnostics =
    diagnosticState.key === contextKey ? diagnosticState.data : null;
  const loading = loadingKey === contextKey;
  const diagnosing = diagnosingKey === contextKey;
  const stale =
    candidate &&
    (JSON.stringify(candidate.snapshot) !== JSON.stringify(snapshot) ||
      candidate.text !== candidate.result.optimized ||
      candidate.historical);
  function cancel() {
    if (diagnosticTimer.current) clearTimeout(diagnosticTimer.current);
    diagnosticId.current++;
    optimizeId.current++;
    diagnosticController.current?.abort();
    optimizeController.current?.abort();
    setLoadingKey(null);
    setDiagnosingKey(null);
    setDiagnosticState({ data: null, key: "" });
    setTestOpen(false);
  }
  function changeDraft(next: Draft, replacement = false, clearResult = false) {
    cancel();
    if (replacement) setUndo(draft);
    setDraft(next);
    setQuestion("");
    setAnswer("");
    setError("");
    if (clearResult) setCandidate(null);
  }
  function refreshHistory() {
    try {
      setHistory(loadHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : "History unavailable.");
    }
  }
  useEffect(() => {
    return () => {
      diagnosticController.current?.abort();
      optimizeController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const id = ++diagnosticId.current;
    diagnosticController.current?.abort();
    optimizeId.current++;
    optimizeController.current?.abort();
    if (!settings.autoDiagnose || !draft.prompt.trim()) return;
    const controller = new AbortController();
    diagnosticController.current = controller;
    const timer = setTimeout(async () => {
      setDiagnosingKey(contextKey);
      try {
        const data = await requestDiagnostics(
          draft,
          settings,
          controller.signal,
        );
        if (diagnosticId.current === id && !controller.signal.aborted)
          setDiagnosticState({ data, key: contextKey });
      } catch (e) {
        if (diagnosticId.current === id && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Diagnostics unavailable.");
      } finally {
        if (diagnosticId.current === id) setDiagnosingKey(null);
      }
    }, 600);
    diagnosticTimer.current = timer;
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, settings, contextKey]);
  async function diagnose() {
    if (diagnosticTimer.current) clearTimeout(diagnosticTimer.current);
    diagnosticController.current?.abort();
    const id = ++diagnosticId.current;
    if (!draft.prompt.trim()) {
      setDiagnosticState({ data: null, key: "" });
      setDiagnosingKey(null);
      return;
    }
    const controller = new AbortController();
    diagnosticController.current = controller;
    setDiagnosingKey(contextKey);
    setError("");
    try {
      const data = await requestDiagnostics(draft, settings, controller.signal);
      if (id === diagnosticId.current && !controller.signal.aborted)
        setDiagnosticState({ data, key: contextKey });
    } catch (e) {
      if (id === diagnosticId.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Diagnostics failed.");
    } finally {
      if (id === diagnosticId.current) setDiagnosingKey(null);
    }
  }
  async function optimize() {
    optimizeController.current?.abort();
    const id = ++optimizeId.current;
    const frozen = { ...snapshot };
    const controller = new AbortController();
    optimizeController.current = controller;
    setLoadingKey(contextKey);
    setError("");
    setNotice("");
    setTestOpen(false);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: requestHeaders(settings),
        signal: controller.signal,
        body: JSON.stringify({
          ...frozen,
          diagnosticSource: settings.diagnosticSource,
          allowLocalFallback: settings.allowLocalFallback,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Rewrite failed.");
      if (id !== optimizeId.current || controller.signal.aborted) return;
      const result = data as OptimizationResult;
      setCandidate({ result, snapshot: frozen, text: result.optimized });
      try {
        saveHistoryItem({ ...result, ...frozen, original: frozen.prompt });
        refreshHistory();
      } catch {
        setError(
          "Candidate is ready, but could not be saved locally. Browser storage may be full or disabled.",
        );
      }
    } catch (e) {
      if (id === optimizeId.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Rewrite failed.");
    } finally {
      if (id === optimizeId.current) setLoadingKey(null);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied.");
    } catch {
      setError("Clipboard unavailable. Select the text and copy manually.");
    }
  }
  function restore(item: PromptHistoryItem) {
    changeDraft(
      {
        prompt: item.original,
        kind: item.kind,
        mode: item.mode,
        engineTarget: item.engineTarget,
      },
      true,
    );
    setCandidate({
      result: item,
      snapshot: {
        prompt: item.original,
        kind: item.kind,
        mode: item.mode,
        engineTarget: item.engineTarget,
        profileVersion: item.profileVersion,
        model: item.model,
      },
      text: item.optimized,
      historical: true,
    });
    setHistoryOpen(false);
  }
  const visual = draft.kind === "image" || draft.kind === "video";
  const connection = settings.deepseekApiKey
    ? "BYOK configured"
    : settings.appAccessToken && server?.deepseek
      ? "Protected shared access supplied, test in Settings"
      : server?.deepseek
        ? "Protected shared access requires owner token"
        : "Rewrite access not configured";
  return (
    <>
      <a className="skip-link" href="#draft">
        Skip to draft editor
      </a>
      <header className="workbench-header">
        <div className="brand">
          <BrandMark className="size-7" />
          <div>
            <span>NODAYSIDLE</span>
            <h1>Prompt workbench</h1>
          </div>
        </div>
        <nav aria-label="Workbench">
          <button
            onClick={() => {
              refreshHistory();
              setHistoryOpen(true);
            }}
          >
            History
          </button>
          <button onClick={() => setSettingsOpen(true)}>Settings</button>
        </nav>
      </header>
      <main className="workbench-main">
        <div className="connection">
          <p>
            {connection} · {settings.deepseekModel}
          </p>
          <p className="help">
            Diagnostics:{" "}
            {settings.diagnosticSource === "local"
              ? "App-server heuristics, no AI-provider transmission"
              : `${settings.diagnosticSource}, explicit AI-provider data sharing`}
          </p>
        </div>
        <div className="control-grid">
          <div>
            <label htmlFor="kind">Prompt type</label>
            <select
              id="kind"
              value={draft.kind}
              onChange={(e) =>
                changeDraft({
                  ...draft,
                  kind: e.target.value as PromptKind,
                  engineTarget: "universal",
                })
              }
            >
              {PROMPT_KINDS.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mode">Optimization mode</label>
            <select
              id="mode"
              value={draft.mode}
              onChange={(e) =>
                changeDraft({
                  ...draft,
                  mode: e.target.value as OptimizationMode,
                })
              }
            >
              {MODES.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="profile">Versioned target profile</label>
            <select
              id="profile"
              value={draft.engineTarget}
              onChange={(e) =>
                changeDraft({
                  ...draft,
                  engineTarget: e.target.value as EngineTarget,
                })
              }
            >
              {Object.entries(PROFILES)
                .filter(([, profile]) => profile.kinds.includes(draft.kind))
                .map(([key, profile]) => (
                  <option key={key} value={key}>
                    {profile.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <p className="help">
          {draft.mode === "minimal"
            ? "Smallest useful edit. No invented context or extra requirements."
            : draft.mode === "structured"
              ? "Organize supplied information without adding facts."
              : "Optional creative expansion, with assumptions listed separately. Hard constraints still apply."}
        </p>
        <div className="editor-grid">
          <section className="editor-pane">
            <div className="pane-heading">
              <label htmlFor="draft">Your draft</label>
              <span className="help">
                {draft.prompt.length}/20000 characters
              </span>
            </div>
            <textarea
              ref={textarea}
              id="draft"
              maxLength={20000}
              value={draft.prompt}
              onChange={(e) =>
                changeDraft({ ...draft, prompt: e.target.value })
              }
            />
            <div className="action-row">
              <button
                className="primary"
                disabled={loading || !draft.prompt.trim()}
                onClick={optimize}
              >
                {loading ? "Rewriting…" : "Rewrite draft"}
              </button>
              <button
                disabled={!draft.prompt}
                onClick={() =>
                  changeDraft({ ...draft, prompt: "" }, true, true)
                }
              >
                Clear draft
              </button>
              <button
                disabled={!draft.prompt}
                onClick={() => copy(draft.prompt)}
              >
                Copy draft
              </button>
              <button
                disabled={!undo}
                onClick={() => {
                  if (undo) {
                    const previous = undo;
                    changeDraft(previous);
                    setUndo(null);
                    setNotice("Draft replacement undone.");
                  }
                }}
              >
                Undo replacement
              </button>
              <button
                disabled={visual || !draft.prompt.trim()}
                onClick={() => {
                  setTestDraft(true);
                  setTestOpen(true);
                }}
              >
                Test draft text
              </button>
            </div>
            <details>
              <summary>Examples and visual controls</summary>
              <label htmlFor="examples">
                Example for this prompt type (replaces draft, Undo available)
              </label>
              <select
                id="examples"
                value=""
                onChange={(e) => {
                  const example = PROMPT_EXAMPLES[Number(e.target.value)];
                  if (example) {
                    changeDraft(
                      {
                        ...draft,
                        prompt: example.prompt,
                        kind: example.kind,
                        engineTarget: example.engineTarget || "universal",
                      },
                      true,
                      true,
                    );
                    setNotice(
                      "Example loaded. Undo replacement restores your draft.",
                    );
                  }
                }}
              >
                <option value="">Choose an example</option>
                {PROMPT_EXAMPLES.map((example, index) =>
                  example.kind === draft.kind ? (
                    <option value={index} key={example.title}>
                      {example.title}
                    </option>
                  ) : null,
                )}
              </select>
              {visual && (
                <>
                  <label htmlFor="ratio">One aspect ratio</label>
                  <select
                    id="ratio"
                    value={ratio}
                    onChange={(e) => {
                      const value = e.target.value;
                      changeDraft(
                        {
                          ...draft,
                          prompt: composePresets(
                            draft.prompt,
                            draft.engineTarget,
                            value,
                            lens,
                          ),
                        },
                        true,
                      );
                    }}
                  >
                    <option value="">No added ratio</option>
                    {Array.from(
                      new Set([
                        "16:9",
                        "9:16",
                        "1:1",
                        "4:5",
                        ...(ratio ? [ratio] : []),
                      ]),
                    ).map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <label htmlFor="lens">One lens</label>
                  <select
                    id="lens"
                    value={lens}
                    onChange={(e) => {
                      const value = e.target.value;
                      changeDraft(
                        {
                          ...draft,
                          prompt: composePresets(
                            draft.prompt,
                            draft.engineTarget,
                            ratio,
                            value,
                          ),
                        },
                        true,
                      );
                    }}
                  >
                    <option value="">No added lens</option>
                    {Array.from(
                      new Set([
                        "35mm",
                        "85mm",
                        "24mm anamorphic",
                        "100mm macro",
                        ...(lens ? [lens] : []),
                      ]),
                    ).map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const prompt = addReferencePhotoInstruction(draft.prompt);
                      if (prompt !== draft.prompt)
                        changeDraft({ ...draft, prompt }, true);
                    }}
                  >
                    Add reference-photo instruction
                  </button>
                  <p className="help">
                    Reference instructions request likeness preservation, not an
                    exact identity guarantee. No attachment is transmitted by
                    this app.
                  </p>
                </>
              )}
            </details>
          </section>
          <section
            className="editor-pane result-pane"
            aria-label="Candidate result"
          >
            <div className="pane-heading">
              {candidate ? (
                <label htmlFor="candidate">Candidate</label>
              ) : (
                <h2>Candidate</h2>
              )}
              <span className="help">
                {candidateLabel(candidate, Boolean(stale))}
              </span>
            </div>
            {candidate ? (
              <>
                <textarea
                  id="candidate"
                  maxLength={20000}
                  value={candidate.text}
                  onChange={(e) => {
                    setTestOpen(false);
                    setCandidate({ ...candidate, text: e.target.value });
                  }}
                />
                <div className="action-row">
                  <button onClick={() => copy(candidate.text)}>
                    Copy candidate
                  </button>
                  <button
                    disabled={!candidate.text.trim()}
                    onClick={() => {
                      changeDraft(
                        {
                          ...draft,
                          prompt: candidate.text,
                          kind: candidate.snapshot.kind,
                          mode: candidate.snapshot.mode,
                          engineTarget: candidate.snapshot.engineTarget,
                        },
                        true,
                      );
                      setNotice(
                        "Candidate is now the draft. Undo replacement is available.",
                      );
                    }}
                  >
                    Use as next draft
                  </button>
                  <button aria-pressed={diff} onClick={() => setDiff(!diff)}>
                    Word diff
                  </button>
                  <button
                    disabled={
                      candidate.snapshot.kind === "image" ||
                      candidate.snapshot.kind === "video" ||
                      !candidate.text.trim()
                    }
                    onClick={() => {
                      setTestDraft(false);
                      setTestOpen(true);
                    }}
                  >
                    Compare text outputs
                  </button>
                </div>
                <p className="help">
                  {stale
                    ? "Draft, model, profile or candidate changed. Previous verification is stale. Diff remains bound to the saved original below."
                    : candidate.result.qualityGate.reason}
                </p>
                <details>
                  <summary>Frozen original and configuration</summary>
                  <p className="help">
                    {candidate.snapshot.kind} · {candidate.snapshot.mode} ·{" "}
                    {candidate.snapshot.profileVersion} ·{" "}
                    {candidate.snapshot.model}
                  </p>
                  <pre data-testid="frozen-original">
                    {candidate.snapshot.prompt}
                  </pre>
                </details>
              </>
            ) : (
              <div className="result-empty">
                <h2>Review before you use</h2>
                <p>
                  A rewrite appears here after you run it. Missing facts become
                  separate questions, never invented task context.
                </p>
                {loading && (
                  <p role="status">
                    Waiting for the provider. You can edit or clear the draft to
                    cancel.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
        <p className="feedback" aria-live="polite">
          {error || settingsError || notice}
        </p>
        {visual && (
          <details className="profile-details">
            <summary>Profile compatibility and sources</summary>
            <p>
              {PROFILES[draft.engineTarget].status}. Version:{" "}
              {PROFILES[draft.engineTarget].version}. Separate negative input:{" "}
              {PROFILES[draft.engineTarget].negative
                ? "supported for this version where the host exposes it"
                : "not supported or not verified"}
              .
            </p>
            <p>{PROFILES[draft.engineTarget].guidance}</p>
            <p>
              Text review only. No image/video generation integration is
              provided; paired text execution is disabled for visual prompts.
            </p>
            {PROFILES[draft.engineTarget].sources.map((url) => (
              <p key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              </p>
            ))}
          </details>
        )}
        <DiagnosticsPanel
          diagnostics={diagnostics}
          loading={diagnosing}
          onRefresh={diagnose}
          onQuestion={(value) => {
            setQuestion(value);
            setAnswer("");
          }}
        />
        {question && (
          <section className="question-answer">
            <label htmlFor="context-answer">{question}</label>
            <textarea
              id="context-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={2000}
            />
            <button
              disabled={
                !answer.trim() ||
                draft.prompt.length + answer.length + 12 > 20000
              }
              onClick={() => {
                changeDraft(
                  {
                    ...draft,
                    prompt: `${draft.prompt}\n\nContext: ${answer.trim()}`,
                  },
                  true,
                );
                textarea.current?.focus();
              }}
            >
              Add my context to draft
            </button>
          </section>
        )}
        {candidate && (
          <section className="result-notes">
            {diff && (
              <DiffViewer
                original={candidate.snapshot.prompt}
                optimized={candidate.text}
              />
            )}
            <h2>Rewrite notes</h2>
            <p>{candidate.result.summary}</p>
            {(["changes", "assumptions", "questions", "warnings"] as const).map(
              (key) =>
                candidate.result[key].length ? (
                  <div key={key}>
                    <h3>{key}</h3>
                    <ul>
                      {candidate.result[key].map((value, index) => (
                        <li key={index}>{value}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
            )}
            {candidate.result.negativePrompt && (
              <div>
                <h3>
                  Separate negative prompt for{" "}
                  {PROFILES[candidate.snapshot.engineTarget].label}
                </h3>
                <pre>{candidate.result.negativePrompt}</pre>
                <button
                  onClick={() => copy(candidate.result.negativePrompt || "")}
                >
                  Copy negative prompt
                </button>
              </div>
            )}
          </section>
        )}
        {candidate && (
          <details className="result-notes">
            <summary>
              Preservation and provider record
              {stale ? " (historical or stale)" : ""}
            </summary>
            <p>
              {candidate.result.qualityGate.source}:{" "}
              {candidate.result.qualityGate.state}.{" "}
              {candidate.result.qualityGate.reason}
            </p>
            {candidate.result.qualityGate.intentPreserved !== undefined && (
              <p className="help">
                Evaluator intent signal:{" "}
                {candidate.result.qualityGate.intentPreserved}; bloat signal:{" "}
                {candidate.result.qualityGate.overEngineered}. Model-based
                signals, not guarantees.
              </p>
            )}
            {candidate.result.diagnostics && (
              <p className="help">
                Original diagnostic source:{" "}
                {candidate.result.diagnostics.source === "local"
                  ? "App-server heuristics, no AI-provider transmission"
                  : candidate.result.diagnostics.source}
                ; clarity rubric: {candidate.result.diagnostics.clarityScore}/3.
                This record is separate from current draft diagnostics.
              </p>
            )}
            {candidate.result.completion && (
              <p className="help">
                Returned model: {candidate.result.completion.model}; elapsed:{" "}
                {candidate.result.completion.elapsedMs} ms.{" "}
                {candidate.result.completion.usage
                  ? `Returned usage: ${candidate.result.completion.usage.prompt_tokens} input / ${candidate.result.completion.usage.completion_tokens} output / ${candidate.result.completion.usage.total_tokens} total tokens.`
                  : "Usage not returned."}
              </p>
            )}
          </details>
        )}
      </main>
      <footer className="workbench-footer">
        NODAYSIDLE · Preservation first. Review candidates in your target
        workflow.
      </footer>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={history}
        onSelectPrompt={restore}
        onRefreshHistory={refreshHistory}
      />
      <TestModal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        snapshot={testDraft ? snapshot : candidate?.snapshot || snapshot}
        candidate={testDraft ? undefined : candidate?.text}
      />
    </>
  );
}
