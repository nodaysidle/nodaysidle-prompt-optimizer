"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { assemble, buildRedline, editsOf } from "@/lib/redline";
import { VERDICT_LABEL, verdictOf, type Verdict } from "@/lib/verdict";
import {
  IDENTITY_LOCK_OUTPUT,
  findPreservationViolations,
  isSubjectInPhotoPrompt,
} from "@/lib/optimizer-prompt";
import { BrandMark } from "./brand-mark";
import { SettingsPanel } from "./settings-panel";
import { HistoryDrawer } from "./history-drawer";
import { DiagnosticsPanel } from "./diagnostics-badge";
import { RedlineView } from "./redline-view";
import { ResultNotes } from "./result-notes";
import { RunLights, type RunStage } from "./run-lights";
import { TestModal } from "./test-modal";

interface Candidate {
  result: OptimizationResult;
  /** What was submitted. The redline always compares against this, never the live draft. */
  snapshot: DraftSnapshot;
  reverted: Set<number>;
  /** The final prompt after hand editing; null while it is derived from the kept edits. */
  hand: string | null;
  showRejected: boolean;
  historical?: boolean;
}
interface Draft {
  prompt: string;
  kind: PromptKind;
  mode: OptimizationMode;
  engineTarget: EngineTarget;
}
interface Failure {
  message: string;
  requestId?: string;
}
/** Text prompts arrive messy and leave agent-ready; visual prompts only need a light touch. */
const defaultMode = (kind: PromptKind): OptimizationMode =>
  kind === "image" || kind === "video" ? "minimal" : "structured";

const EMPTY_DRAFT: Draft = {
  prompt: "",
  kind: "user",
  mode: defaultMode("user"),
  engineTarget: "universal",
};

const KIND_LABEL: Record<PromptKind, string> = {
  user: "User prompt",
  system: "System prompt",
  image: "Image prompt",
  video: "Video prompt",
};
const KIND_HINT: Record<PromptKind, string> = {
  user: "A question or task for ChatGPT, Claude, Cursor or a similar assistant.",
  system: "Rules and persona that govern an AI agent.",
  image: "A still picture, for Nano Banana or ChatGPT Images.",
  video: "A shot, for Veo 3.1 or Gemini Omni.",
};
const MODE_LABEL: Record<OptimizationMode, string> = {
  minimal: "Light edit",
  structured: "Restructure",
  creative: "Allow additions",
};
const MODE_HINT: Record<OptimizationMode, string> = {
  minimal: "The smallest useful edit. No invented context or extra requirements.",
  structured: "Turns what you wrote into an agent-ready brief. No new facts.",
  creative: "Optional additions, listed as assumptions. Your hard constraints still apply.",
};
const VERDICT_DETAIL: Record<Verdict, string> = {
  kept: "The rewrite did not pass verification, or was not clearly better, so your prompt is unchanged.",
  checked: "The judge model found your intent kept and no bloat, and the built-in checks passed.",
  review: "Something the checks flagged is listed under Worth a second look.",
  unchecked: "No judge model was available, so only the built-in checks ran.",
};

class RunFailure extends Error {
  constructor(
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

async function requestDiagnostics(
  draft: Draft,
  settings: AppSettings,
  signal: AbortSignal,
): Promise<DiagnosticResult> {
  const response = await fetch("/api/diagnose", {
    method: "POST",
    headers: requestHeaders(settings),
    signal,
    body: JSON.stringify({ prompt: draft.prompt, kind: draft.kind }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Reading the draft failed.");
  return data;
}

/** Reads the optimize stream: one line per real stage, then a result or an error. */
async function readRun(
  response: Response,
  onStage: (stage: RunStage) => void,
): Promise<OptimizationResult> {
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new RunFailure(data.error || "The run failed.", data.requestId);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: OptimizationResult | undefined;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.stage) onStage(event.stage as RunStage);
    if (event.result) result = event.result as OptimizationResult;
    if (event.error) throw new RunFailure(event.error, event.requestId);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  if (!result) throw new RunFailure("The run ended without a result.");
  return result;
}

/** Lines a hand-picked final text must still satisfy, so a revert cannot silently drop them. */
function protectedProblems(snapshot: DraftSnapshot, finalText: string): string[] {
  const problems = findPreservationViolations(snapshot.prompt, finalText);
  const visual = snapshot.kind === "image" || snapshot.kind === "video";
  if (
    visual &&
    isSubjectInPhotoPrompt(snapshot.prompt) &&
    !finalText.trim().startsWith(IDENTITY_LOCK_OUTPUT)
  )
    problems.push("The reference-photo line is missing, so likeness is no longer requested.");
  return problems;
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
  const [stage, setStage] = useState<RunStage>("idle");
  const [running, setRunning] = useState(false);
  const [diagnosingKey, setDiagnosingKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
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
  const redlineHeading = useRef<HTMLHeadingElement | null>(null);

  const snapshot: DraftSnapshot = {
    ...draft,
    profileVersion: PROFILES[draft.engineTarget].version,
    model: settings.deepseekModel,
  };
  const contextKey = JSON.stringify([draft, settings]);
  const diagnostics =
    diagnosticState.key === contextKey ? diagnosticState.data : null;
  const diagnosing = diagnosingKey === contextKey;
  const visual = draft.kind === "image" || draft.kind === "video";
  const canRun = Boolean(
    settings.deepseekApiKey ||
      settings.openrouterApiKey ||
      (settings.appAccessToken && (server?.deepseek || server?.openrouter)),
  );

  // The redline is derived from what was submitted and what came back, nothing else.
  const target = candidate
    ? candidate.showRejected && candidate.result.rejectedDraft
      ? candidate.result.rejectedDraft.optimized
      : candidate.result.optimized
    : "";
  const segments = useMemo(
    () => (candidate ? buildRedline(candidate.snapshot.prompt, target) : []),
    [candidate, target],
  );
  const edits = editsOf(segments);
  const finalText = candidate
    ? (candidate.hand ?? assemble(segments, candidate.reverted))
    : "";
  const stale =
    candidate &&
    (candidate.historical ||
      JSON.stringify(candidate.snapshot) !== JSON.stringify(snapshot));
  const problems = candidate ? protectedProblems(candidate.snapshot, finalText) : [];

  function cancel() {
    if (diagnosticTimer.current) clearTimeout(diagnosticTimer.current);
    diagnosticId.current++;
    optimizeId.current++;
    diagnosticController.current?.abort();
    optimizeController.current?.abort();
    setRunning(false);
    setStage("idle");
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
    setFailure(null);
    if (clearResult) setCandidate(null);
  }
  function refreshHistory() {
    try {
      setHistory(loadHistory());
    } catch (e) {
      setFailure({ message: e instanceof Error ? e.message : "History unavailable." });
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
        const data = await requestDiagnostics(draft, settings, controller.signal);
        if (diagnosticId.current === id && !controller.signal.aborted)
          setDiagnosticState({ data, key: contextKey });
      } catch (e) {
        if (diagnosticId.current === id && !controller.signal.aborted)
          setFailure({ message: e instanceof Error ? e.message : "Reading the draft failed." });
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
    setFailure(null);
    try {
      const data = await requestDiagnostics(draft, settings, controller.signal);
      if (id === diagnosticId.current && !controller.signal.aborted)
        setDiagnosticState({ data, key: contextKey });
    } catch (e) {
      if (id === diagnosticId.current && !controller.signal.aborted)
        setFailure({ message: e instanceof Error ? e.message : "Reading the draft failed." });
    } finally {
      if (id === diagnosticId.current) setDiagnosingKey(null);
    }
  }

  async function optimize() {
    if (!draft.prompt.trim() || !canRun) return;
    optimizeController.current?.abort();
    const id = ++optimizeId.current;
    const frozen = { ...snapshot };
    const controller = new AbortController();
    optimizeController.current = controller;
    setRunning(true);
    setStage("sent");
    setFailure(null);
    setNotice("");
    setTestOpen(false);
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { ...requestHeaders(settings), Accept: "application/x-ndjson" },
        signal: controller.signal,
        body: JSON.stringify(frozen),
      });
      const result = await readRun(response, (next) => {
        if (id === optimizeId.current) setStage(next);
      });
      if (id !== optimizeId.current || controller.signal.aborted) return;
      setCandidate({
        result,
        snapshot: frozen,
        reverted: new Set(),
        hand: null,
        showRejected: false,
      });
      // On a phone the result sits far below the draft; take the reader to it.
      requestAnimationFrame(() => redlineHeading.current?.focus());
      try {
        saveHistoryItem({ ...result, ...frozen, original: frozen.prompt });
        refreshHistory();
      } catch {
        setNotice(
          "The result is ready, but it could not be saved to history. Browser storage may be full or disabled.",
        );
      }
    } catch (e) {
      if (id === optimizeId.current && !controller.signal.aborted)
        setFailure(
          e instanceof RunFailure
            ? { message: e.message, requestId: e.requestId }
            : { message: e instanceof Error ? e.message : "The run failed." },
        );
    } finally {
      if (id === optimizeId.current) {
        setRunning(false);
        setStage("idle");
      }
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied.");
    } catch {
      setFailure({ message: "The clipboard is unavailable. Select the text and copy it by hand." });
    }
  }
  function toggleEdit(id: number) {
    if (!candidate) return;
    const reverted = new Set(candidate.reverted);
    if (reverted.has(id)) reverted.delete(id);
    else reverted.add(id);
    setCandidate({ ...candidate, reverted });
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
      reverted: new Set(),
      hand: null,
      showRejected: false,
      historical: true,
    });
    setHistoryOpen(false);
  }

  const verdict = candidate ? verdictOf(candidate.result) : null;
  const keptCount = edits.length - (candidate?.reverted.size ?? 0);

  return (
    <>
      <a className="skip-link" href="#draft">
        Skip to the prompt editor
      </a>
      <header className="bar">
        <div className="brand">
          <BrandMark className="brand-mark" />
          <span className="brand-name">NODAYSIDLE</span>
          <h1 className="brand-tool">Prompt Optimizer</h1>
        </div>
        <nav aria-label="Optimizer">
          <button
            type="button"
            onClick={() => {
              refreshHistory();
              setHistoryOpen(true);
            }}
          >
            History
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </nav>
      </header>

      <main className="stage">
        <section className="column" aria-label="Your prompt">
          <h2 className="section-title">Your prompt</h2>

          <fieldset className="choice">
            <legend>Prompt type</legend>
            <div className="seg">
              {PROMPT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={draft.kind === kind}
                  onClick={() =>
                    changeDraft({ ...draft, kind, mode: defaultMode(kind), engineTarget: "universal" })
                  }
                >
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            <p className="help">{KIND_HINT[draft.kind]}</p>
          </fieldset>

          <fieldset className="choice">
            <legend>How far to go</legend>
            <div className="seg">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={draft.mode === mode}
                  onClick={() => changeDraft({ ...draft, mode })}
                >
                  {MODE_LABEL[mode]}
                </button>
              ))}
            </div>
            <p className="help">{MODE_HINT[draft.mode]}</p>
          </fieldset>

          {visual && (
            <div className="choice">
              <label htmlFor="profile">Writing for</label>
              <select
                id="profile"
                value={draft.engineTarget}
                onChange={(e) =>
                  changeDraft({ ...draft, engineTarget: e.target.value as EngineTarget })
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
              <p className="help">{PROFILES[draft.engineTarget].status}.</p>
            </div>
          )}

          <div className="choice">
            <div className="pane-heading">
              <label htmlFor="draft">Draft</label>
              <span className="help">{draft.prompt.length} of 20000 characters</span>
            </div>
            <textarea
              ref={textarea}
              id="draft"
              className="prompt-text"
              rows={12}
              maxLength={20000}
              value={draft.prompt}
              aria-describedby="draft-help"
              onChange={(e) => changeDraft({ ...draft, prompt: e.target.value })}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void optimize();
                }
              }}
            />
            <p className="help" id="draft-help">
              Paste what you have. Ctrl+Enter runs it.
            </p>
          </div>

          <div className="run">
            <button
              type="button"
              className="primary"
              disabled={running || !draft.prompt.trim() || !canRun}
              onClick={optimize}
            >
              {running ? "Optimizing" : "Optimize prompt"}
            </button>
            <RunLights stage={stage} />
          </div>
          {!canRun && (
            <p className="help" role="note">
              Add a DeepSeek or OpenRouter key to run the optimizer. Keys stay in this
              tab unless you choose to remember them.{" "}
              <button type="button" className="link" onClick={() => setSettingsOpen(true)}>
                Open Settings
              </button>
            </p>
          )}

          <div className="action-row">
            <button
              type="button"
              disabled={!draft.prompt}
              onClick={() => changeDraft({ ...draft, prompt: "" }, true, true)}
            >
              Clear draft
            </button>
            <button type="button" disabled={!draft.prompt} onClick={() => copy(draft.prompt)}>
              Copy draft
            </button>
            <button
              type="button"
              disabled={!undo}
              onClick={() => {
                if (undo) {
                  changeDraft(undo);
                  setUndo(null);
                  setNotice("Replacement undone.");
                }
              }}
            >
              Undo replacement
            </button>
            <button
              type="button"
              disabled={visual || !draft.prompt.trim()}
              onClick={() => {
                setTestDraft(true);
                setTestOpen(true);
              }}
            >
              Test the draft
            </button>
          </div>

          <details>
            <summary>Examples and visual options</summary>
            <label htmlFor="examples">
              Example for this prompt type (replaces the draft; Undo is available)
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
                  setNotice("Example loaded. Undo replacement restores your draft.");
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
                  onChange={(e) =>
                    changeDraft(
                      {
                        ...draft,
                        prompt: composePresets(draft.prompt, draft.engineTarget, e.target.value, lens),
                      },
                      true,
                    )
                  }
                >
                  <option value="">No added ratio</option>
                  {Array.from(
                    new Set(["16:9", "9:16", "1:1", "4:5", ...(ratio ? [ratio] : [])]),
                  ).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <label htmlFor="lens">One lens</label>
                <select
                  id="lens"
                  value={lens}
                  onChange={(e) =>
                    changeDraft(
                      {
                        ...draft,
                        prompt: composePresets(draft.prompt, draft.engineTarget, ratio, e.target.value),
                      },
                      true,
                    )
                  }
                >
                  <option value="">No added lens</option>
                  {Array.from(
                    new Set(["35mm", "85mm", "24mm anamorphic", "100mm macro", ...(lens ? [lens] : [])]),
                  ).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const prompt = addReferencePhotoInstruction(draft.prompt);
                    if (prompt !== draft.prompt) changeDraft({ ...draft, prompt }, true);
                  }}
                >
                  Add reference-photo line
                </button>
                <p className="help">
                  The line asks for the likeness to be kept. It is not a guarantee, and no
                  photo is sent from this app.
                </p>
              </>
            )}
          </details>

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
                type="button"
                disabled={!answer.trim() || draft.prompt.length + answer.length + 12 > 20000}
                onClick={() => {
                  changeDraft(
                    { ...draft, prompt: `${draft.prompt}\n\nContext: ${answer.trim()}` },
                    true,
                  );
                  textarea.current?.focus();
                }}
              >
                Add my answer to the draft
              </button>
            </section>
          )}
        </section>

        <section className="column" aria-label="Redline">
          <h2 className="section-title" tabIndex={-1} ref={redlineHeading}>
            Redline
          </h2>

          <p className="feedback" role="status" aria-live="polite">
            {notice || settingsError}
          </p>

          {failure && (
            <div className="failure" role="alert">
              <p>
                <strong>That did not work.</strong> {failure.message}
              </p>
              {failure.requestId && <p className="help">Request {failure.requestId}</p>}
              {canRun && draft.prompt.trim() && !running && (
                <button type="button" onClick={optimize}>
                  Run again
                </button>
              )}
            </div>
          )}

          {!candidate && !running && !failure && (
            <div className="empty">
              <p>
                Run the optimizer and the result lands here as edits to your own words.
                Keep the ones you want, revert the rest, then copy the final prompt.
              </p>
              <p className="help">
                Short, clear prompts often come back unchanged. That is a valid result.
              </p>
            </div>
          )}

          {running && !candidate && (
            <div className="empty">
              <p>Working on it. Edit or clear the draft to cancel.</p>
            </div>
          )}

          {candidate && verdict && (
            <>
              <p className="verdict" data-verdict={verdict}>
                <strong>{VERDICT_LABEL[verdict]}.</strong> {VERDICT_DETAIL[verdict]}
              </p>
              {stale && (
                <p className="stale" role="note">
                  {candidate.historical
                    ? "Loaded from history. "
                    : "You changed the draft or the settings after this run. "}
                  The redline compares against the prompt that was submitted, shown below.
                </p>
              )}

              {candidate.result.rejectedDraft && (
                <div className="kept-note">
                  {candidate.result.rejectedDraft.problems.length > 0 && (
                    <p>Why: {candidate.result.rejectedDraft.problems.join("; ")}.</p>
                  )}
                  <button
                    type="button"
                    aria-pressed={candidate.showRejected}
                    onClick={() =>
                      setCandidate({
                        ...candidate,
                        showRejected: !candidate.showRejected,
                        reverted: new Set(),
                        hand: null,
                      })
                    }
                  >
                    {candidate.showRejected
                      ? "Hide the rejected draft"
                      : "Review the rejected draft anyway"}
                  </button>
                </div>
              )}

              <div className="redline-head">
                <h3>Edits</h3>
                <span className="help">
                  {edits.length === 0
                    ? "No edits."
                    : `${edits.length} ${edits.length === 1 ? "edit" : "edits"}, ${keptCount} kept. j and k move between edits.`}
                </span>
              </div>
              {edits.length === 0 && !candidate.showRejected ? (
                <p className="redline-same">{candidate.snapshot.prompt}</p>
              ) : (
                <RedlineView
                  segments={segments}
                  reverted={candidate.reverted}
                  locked={candidate.hand !== null}
                  onToggle={toggleEdit}
                />
              )}

              <div className="choice">
                <div className="pane-heading">
                  <label htmlFor="final">Final prompt</label>
                  <span className="help">
                    {candidate.hand !== null ? "Edited by hand" : "Built from the edits you kept"}
                  </span>
                </div>
                <textarea
                  id="final"
                  className="prompt-text"
                  rows={10}
                  maxLength={20000}
                  value={finalText}
                  onChange={(e) => {
                    setTestOpen(false);
                    setCandidate({ ...candidate, hand: e.target.value });
                  }}
                />
                {problems.length > 0 && (
                  <div className="problems" role="alert">
                    <p>
                      <strong>This text no longer matches what you wrote.</strong>
                    </p>
                    <ul>
                      {problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="action-row">
                  <button type="button" className="primary" onClick={() => copy(finalText)}>
                    Copy final prompt
                  </button>
                  <button
                    type="button"
                    disabled={!finalText.trim()}
                    onClick={() => {
                      changeDraft(
                        {
                          ...draft,
                          prompt: finalText,
                          kind: candidate.snapshot.kind,
                          mode: candidate.snapshot.mode,
                          engineTarget: candidate.snapshot.engineTarget,
                        },
                        true,
                      );
                      setNotice("The final prompt is now the draft. Undo replacement is available.");
                    }}
                  >
                    Use as next draft
                  </button>
                  {candidate.hand !== null && (
                    <button type="button" onClick={() => setCandidate({ ...candidate, hand: null })}>
                      Reset to the kept edits
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      candidate.snapshot.kind === "image" ||
                      candidate.snapshot.kind === "video" ||
                      !finalText.trim()
                    }
                    onClick={() => {
                      setTestDraft(false);
                      setTestOpen(true);
                    }}
                  >
                    Compare outputs
                  </button>
                </div>
              </div>

              <ResultNotes result={candidate.result} snapshot={candidate.snapshot} onCopy={copy} />
            </>
          )}
        </section>
      </main>

      <footer className="foot">
        <span>NODAYSIDLE</span>
        <span>Your prompt goes to the provider you chose, through this app&rsquo;s server. Keys and history stay in this browser.</span>
      </footer>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
        candidate={testDraft ? undefined : finalText}
      />
    </>
  );
}
