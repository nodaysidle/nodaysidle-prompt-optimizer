"use client";

import {
  AlertCircle,
  Check,
  CheckCircle,
  Copy,
  Eye,
  GitCompare,
  ImageIcon,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Terminal,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings-context";
import type { DiagnosticResult, OptimizationResult, PromptKind } from "@/lib/types";
import { PROMPT_EXAMPLES, PromptExample } from "@/lib/examples";
import { cn } from "@/lib/cn";
import { SettingsPanel } from "./settings-panel";
import { DiffViewer } from "./diff-viewer";
import { DiagnosticsPanel } from "./diagnostics-badge";
import { TestModal } from "./test-modal";

const KINDS: { id: PromptKind; label: string; icon: typeof MessageSquare }[] = [
  { id: "user", label: "User prompt", icon: MessageSquare },
  { id: "system", label: "System prompt", icon: Terminal },
  { id: "image", label: "Image prompt", icon: ImageIcon },
];

export function PromptWorkspace() {
  const { settings } = useSettings();
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<PromptKind>("user");
  const [loading, setLoading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "diff">("split");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testModalState, setTestModalState] = useState<{
    open: boolean;
    prompt: string;
    title: string;
  }>({
    open: false,
    prompt: "",
    title: "",
  });
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedOptimized, setCopiedOptimized] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Run diagnostics via /api/diagnose
  const fetchDiagnostics = useCallback(
    async (textToDiagnose: string, targetKind: PromptKind) => {
      const trimmed = textToDiagnose.trim();
      if (!trimmed || trimmed.length < 10) {
        setDiagnostics(null);
        return;
      }
      setDiagnosing(true);
      try {
        const res = await fetch("/api/diagnose", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-typesafe-key": settings.typesafeApiKey || "",
          },
          body: JSON.stringify({ prompt: trimmed, kind: targetKind }),
        });
        if (res.ok) {
          const data = (await res.json()) as DiagnosticResult;
          setDiagnostics(data);
        }
      } catch {
        // silent fail for debounced diagnostic
      } finally {
        setDiagnosing(false);
      }
    },
    [settings.typesafeApiKey],
  );

  // Debounced auto-diagnose on typing
  useEffect(() => {
    if (!settings.autoDiagnose) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!prompt.trim() || prompt.trim().length < 15) {
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchDiagnostics(prompt, kind);
    }, 700);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [prompt, kind, settings.autoDiagnose, fetchDiagnostics]);

  async function handleOptimize() {
    setError(null);
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Paste or type a prompt to optimize.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-deepseek-key": settings.deepseekApiKey || "",
          "x-typesafe-key": settings.typesafeApiKey || "",
        },
        body: JSON.stringify({
          prompt: trimmed,
          kind,
          model: settings.deepseekModel,
          existingDiagnostics: diagnostics,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Optimization failed.");
      }

      setResult(data as OptimizationResult);
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Optimization failed.";
      setError(msg);
      if (msg.includes("DeepSeek API key is required")) {
        setSettingsOpen(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function loadExample(example: PromptExample) {
    setPrompt(example.prompt);
    setKind(example.kind);
    setResult(null);
    setError(null);
    fetchDiagnostics(example.prompt, example.kind);
  }

  async function copyText(text: string, isOpt: boolean) {
    await navigator.clipboard.writeText(text);
    if (isOpt) {
      setCopiedOptimized(true);
      setTimeout(() => setCopiedOptimized(false), 2000);
    } else {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    }
  }

  function openTestPlayground(textToTest: string, label: string) {
    if (!textToTest) return;
    setTestModalState({
      open: true,
      prompt: textToTest,
      title: `Playground Test: ${label}`,
    });
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 shadow-lg shadow-violet-950/50">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-zinc-100">
                  Prompt Optimizer
                </h1>
                <span className="rounded-md border border-violet-800/60 bg-violet-950/60 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                  DeepSeek Flash
                </span>
                <span className="rounded-md border border-emerald-800/60 bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                  Jev Diagnostics
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                System One probabilistic rubric linter + DeepSeek platform engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                settings.deepseekApiKey
                  ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
                  : "border-amber-700/60 bg-amber-950/30 text-amber-300 hover:border-amber-500",
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
              {!settings.deepseekApiKey && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
        {/* Quick Example Presets */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Try an Example
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PROMPT_EXAMPLES.map((ex, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => loadExample(ex)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 hover:border-violet-500/50 hover:bg-zinc-800/80 transition"
              >
                <Wand2 className="h-3 w-3 text-violet-400" />
                <span className="font-medium text-zinc-200">{ex.title}</span>
                <span className="text-zinc-500 text-[11px]">({ex.kind})</span>
              </button>
            ))}
          </div>
        </section>

        {/* Input & Kind Selection */}
        <section className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-400 mr-1">Target Mode:</span>
              {KINDS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKind(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    kind === id
                      ? "border-violet-500/80 bg-violet-600/20 text-violet-200 shadow-sm"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="text-xs font-mono text-zinc-500">
              {prompt.trim().length} chars · ~{Math.ceil(prompt.trim().split(/\s+/).filter(Boolean).length * 1.3)} tokens
            </div>
          </div>

          <div className="relative">
            <textarea
              className="min-h-[170px] w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition"
              placeholder="Paste or type your user prompt, system instructions, or image prompt here..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {prompt && (
              <button
                type="button"
                onClick={() => {
                  setPrompt("");
                  setDiagnostics(null);
                  setResult(null);
                }}
                className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition"
                title="Clear input"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Jev System One Diagnostics Panel */}
          <DiagnosticsPanel
            diagnostics={diagnostics}
            loading={diagnosing}
            onRefresh={() => fetchDiagnostics(prompt, kind)}
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={loading || !prompt.trim()}
              onClick={handleOptimize}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 transition"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Optimize with DeepSeek
            </button>

            {prompt.trim().length > 0 && (
              <button
                type="button"
                onClick={() => openTestPlayground(prompt, "Original Prompt")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 transition"
              >
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                Test Original
              </button>
            )}

            {error && (
              <div className="flex items-center gap-1.5 rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs text-rose-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </section>

        {/* View Mode Switcher */}
        {result && (
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Comparison
              </span>
            </div>
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                  viewMode === "split"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setViewMode("diff")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                  viewMode === "diff"
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Word Diff View
              </button>
            </div>
          </div>
        )}

        {/* Results Display */}
        {viewMode === "diff" && result ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-300">
                Word Diff Visualizer
              </span>
              <button
                type="button"
                onClick={() => copyText(result.optimized, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                {copiedOptimized ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Optimized
                  </>
                )}
              </button>
            </div>
            <DiffViewer original={prompt} optimized={result.optimized} />
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="flex min-h-[260px] flex-col rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">Original Prompt</h3>
                  <p className="text-xs text-zinc-500">Source text before transformation</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!prompt}
                    onClick={() => openTestPlayground(prompt, "Original Prompt")}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                    title="Test original in playground"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!prompt}
                    onClick={() => copyText(prompt, false)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                    title="Copy original"
                  >
                    {copiedOriginal ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-relaxed text-zinc-300">
                {prompt || "—"}
              </pre>
            </div>

            <div className="flex min-h-[260px] flex-col rounded-xl border border-violet-500/30 bg-violet-950/15">
              <div className="flex items-center justify-between border-b border-violet-800/30 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-violet-200">Optimized Prompt</h3>
                    {result?.qualityGate && (
                      <span className="rounded bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        Jev Gate: {Math.round(result.qualityGate.intentPreserved * 100)}% Intent match
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-violet-400/80">
                    {result ? "DeepSeek optimized rewrite" : "Run optimize to generate"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {result?.optimized && (
                    <button
                      type="button"
                      onClick={() => openTestPlayground(result.optimized, "Optimized Prompt")}
                      className="rounded-lg p-2 text-violet-300 hover:bg-violet-900/40 hover:text-white"
                      title="Test optimized in playground"
                    >
                      <Play className="h-4 w-4 text-emerald-400" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!result?.optimized}
                    onClick={() => result && copyText(result.optimized, true)}
                    className="rounded-lg p-2 text-violet-300 hover:bg-violet-900/40 hover:text-white disabled:opacity-30"
                    title="Copy optimized"
                  >
                    {copiedOptimized ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-relaxed text-zinc-100">
                {result?.optimized || (
                  <span className="text-zinc-600">
                    Click &ldquo;Optimize with DeepSeek&rdquo; to generate improved prompt with full constraints and structural formatting.
                  </span>
                )}
              </pre>
            </div>
          </section>
        )}

        {/* What Changed & Quality Gate Details */}
        {result && (
          <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                Transformation Summary
              </h3>
              <p className="mt-1.5 text-sm text-zinc-400">{result.summary}</p>
            </div>

            {result.changes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Key Improvements
                </h4>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {result.changes.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2.5 text-xs text-zinc-300"
                    >
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.qualityGate && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
                <span className="font-semibold text-zinc-300">Jev Quality Gate: </span>
                Intent fidelity confirmed at{" "}
                <span className="font-mono text-emerald-400 font-bold">
                  {Math.round(result.qualityGate.intentPreserved * 100)}%
                </span>
                . Over-engineering cognitive load assessed at{" "}
                <span className="font-mono text-zinc-300">
                  {Math.round(result.qualityGate.overEngineered * 100)}%
                </span>
                .
              </div>
            )}
          </section>
        )}
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <TestModal
        open={testModalState.open}
        onClose={() => setTestModalState((prev) => ({ ...prev, open: false }))}
        prompt={testModalState.prompt}
        title={testModalState.title}
      />
    </>
  );
}
