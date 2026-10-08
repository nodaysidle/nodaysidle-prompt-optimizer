"use client";

import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle,
  Copy,
  Eye,
  GitCompare,
  History,
  ImageIcon,
  KeyRound,
  Lightbulb,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Scale,
  Settings2,
  Sparkles,
  Terminal,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings-context";
import type {
  DiagnosticResult,
  EngineTarget,
  OptimizationResult,
  PromptHistoryItem,
  PromptKind,
} from "@/lib/types";
import { PROMPT_EXAMPLES, PromptExample } from "@/lib/examples";
import { cn } from "@/lib/cn";
import { isSubjectInPhotoPrompt } from "@/lib/optimizer-prompt";
import { loadHistory, saveHistoryItem } from "@/lib/storage";
import { SettingsPanel } from "./settings-panel";
import { DiffViewer } from "./diff-viewer";
import { DiagnosticsPanel } from "./diagnostics-badge";
import { TestModal } from "./test-modal";
import { BrandMark } from "./brand-mark";
import { HistoryDrawer } from "./history-drawer";

const KINDS: {
  id: PromptKind;
  label: string;
  tagline: string;
  icon: typeof MessageSquare;
}[] = [
  {
    id: "user",
    label: "User Prompt",
    tagline: "Direct question or task for ChatGPT, Claude, or Cursor",
    icon: MessageSquare,
  },
  {
    id: "system",
    label: "System Prompt",
    tagline: "Persona guidelines, guardrails & rules for an AI agent",
    icon: Terminal,
  },
  {
    id: "image",
    label: "Image Prompt",
    tagline: "Visual description for Google Nano Banana, Midjourney, Flux",
    icon: ImageIcon,
  },
  {
    id: "video",
    label: "Video Prompt",
    tagline: "Temporal motion & camera path for Veo 3.1, Omni, Kling, Runway",
    icon: Video,
  },
];

export function PromptWorkspace() {
  const { settings } = useSettings();
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<PromptKind>("user");
  const [engineTarget, setEngineTarget] = useState<EngineTarget>("universal");
  const [loading, setLoading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "diff">("split");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<PromptHistoryItem[]>(() =>
    typeof window !== "undefined" ? loadHistory() : [],
  );

  const refreshHistory = useCallback(() => {
    setHistoryItems(loadHistory());
  }, []);

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
  const [copiedNegative, setCopiedNegative] = useState(false);

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
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [prompt, kind, settings.autoDiagnose, fetchDiagnostics]);

  async function handleOptimize() {
    setError(null);
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Please paste or type a prompt first.");
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
          engineTarget,
          model: settings.deepseekModel,
          existingDiagnostics: diagnostics,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Optimization failed.");
      }

      const optResult = data as OptimizationResult;
      setResult(optResult);
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }

      // Save to local history
      saveHistoryItem({
        original: trimmed,
        optimized: optResult.optimized,
        negativePrompt: optResult.negativePrompt,
        kind,
        engineTarget,
        summary: optResult.summary,
      });
      refreshHistory();
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

  function handleKindChange(newKind: PromptKind) {
    setKind(newKind);
    setEngineTarget("universal");
  }

  function handleInsertIdentityLock() {
    if (kind !== "image" && kind !== "video") {
      setKind("image");
    }
    const prefix = "The subject in the photo... ";
    if (!prompt.trim().toLowerCase().startsWith("the subject in the photo")) {
      setPrompt((prev) => (prev ? `${prefix}${prev}` : prefix));
    }
  }

  function applyPreset(type: "ratio" | "lens", value: string) {
    if (type === "ratio") {
      if (engineTarget === "midjourney") {
        setPrompt((prev) => {
          const stripped = prev.replace(/--ar\s+[0-9]+:[0-9]+/gi, "").trim();
          return `${stripped} --ar ${value}`.trim();
        });
      } else {
        setPrompt((prev) => {
          if (prev.toLowerCase().includes(value.toLowerCase())) return prev;
          return `${prev.trim()}, aspect ratio ${value}`.trim();
        });
      }
    } else if (type === "lens") {
      setPrompt((prev) => {
        if (prev.toLowerCase().includes(value.toLowerCase())) return prev;
        return `${prev.trim()}, shot on ${value} lens`.trim();
      });
    }
  }

  function handleSelectHistoryItem(item: PromptHistoryItem) {
    setPrompt(item.original);
    setKind(item.kind);
    if (item.engineTarget) setEngineTarget(item.engineTarget);
    setResult({
      optimized: item.optimized,
      negativePrompt: item.negativePrompt,
      summary: item.summary,
      changes: [],
    });
    setHistoryOpen(false);
  }

  function loadExample(example: PromptExample) {
    setPrompt(example.prompt);
    setKind(example.kind);
    setEngineTarget("universal");
    setResult(null);
    setError(null);
    fetchDiagnostics(example.prompt, example.kind);
  }

  async function copyText(text: string, isOpt: boolean, isNeg = false) {
    await navigator.clipboard.writeText(text);
    if (isNeg) {
      setCopiedNegative(true);
      setTimeout(() => setCopiedNegative(false), 2000);
    } else if (isOpt) {
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
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="size-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Prompt Optimizer
              </span>
              <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted-fg">
                NODAYSIDLE
              </span>
              <span className="hidden sm:inline-flex rounded-full border border-violet-800/60 bg-violet-950/60 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                DeepSeek Flash
              </span>
              <span className="hidden md:inline-flex rounded-full border border-emerald-800/60 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                TypeSafe Jev
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent transition cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-muted-fg" />
              <span className="hidden sm:inline">History & Saved</span>
              <span className="sm:hidden">History</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer",
                settings.deepseekApiKey
                  ? "border-border bg-surface text-foreground hover:border-accent"
                  : "border-amber-600/70 bg-amber-950/40 text-amber-200 hover:border-amber-500",
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
              {!settings.deepseekApiKey && (
                <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-bold text-black uppercase">
                  Add Key
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {/* Friendly Hero Banner */}
        <section className="rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-muted p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Transform rough prompts into production-grade instructions</span>
              </h2>
              <p className="mt-1 text-xs text-muted-fg max-w-2xl leading-relaxed">
                Paste your draft below to get an <strong>instant health check</strong> on what&apos;s missing (boundaries, output formatting, or clear roles). Then generate a structured rewrite powered by DeepSeek Flash.
              </p>
            </div>

            {/* Step Roadmap */}
            <div className="hidden lg:flex items-center gap-2 text-[11px] text-muted-fg bg-background/60 border border-border/80 px-3 py-2 rounded-xl">
              <span className="flex items-center gap-1 text-foreground font-medium">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-accent font-mono text-[10px]">1</span>
                Draft
              </span>
              <ArrowRight className="h-3 w-3 text-muted-fg/60" />
              <span className="flex items-center gap-1 text-foreground font-medium">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-accent font-mono text-[10px]">2</span>
                Audit
              </span>
              <ArrowRight className="h-3 w-3 text-muted-fg/60" />
              <span className="flex items-center gap-1 text-foreground font-medium">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-accent font-mono text-[10px]">3</span>
                Optimize & Test
              </span>
            </div>
          </div>

          {/* Quick Setup Hint (if key not entered) */}
          {!settings.deepseekApiKey && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/40 bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Tip:</strong> Add your DeepSeek API key in Settings to unlock 1-click optimization (~$0.001 per run). You can also click any example below to try the live health audit right now!
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg bg-amber-400/90 px-3 py-1 font-semibold text-zinc-950 hover:bg-amber-300 text-xs transition shrink-0"
              >
                Configure Key
              </button>
            </div>
          )}
        </section>

        {/* 1-Click Example Presets */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-fg flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-accent" />
              Click an example to test:
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {PROMPT_EXAMPLES.map((ex, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => loadExample(ex)}
                className="group flex flex-col items-start rounded-xl border border-border bg-surface/60 p-3 text-left hover:border-accent/60 hover:bg-surface-muted transition text-xs"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-semibold text-foreground group-hover:text-accent transition">
                    {ex.title}
                  </span>
                  <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-fg uppercase border border-border/80">
                    {ex.kind}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-fg line-clamp-1">
                  {ex.description}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Prompt Input & Kind Selection */}
        <section className="space-y-3.5">
          {/* Target Mode Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-fg mb-2">
              Step 1: Choose Prompt Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {KINDS.map(({ id, label, tagline, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleKindChange(id)}
                  className={cn(
                    "flex flex-col items-start rounded-xl border p-3 text-left transition cursor-pointer",
                    kind === id
                      ? "border-accent bg-accent/10 shadow-sm"
                      : "border-border bg-surface/50 text-muted-fg hover:border-border/80 hover:bg-surface-muted",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        kind === id ? "text-accent" : "text-muted-fg",
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        kind === id ? "text-foreground" : "text-muted-fg",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-fg leading-tight">
                    {tagline}
                  </p>
                </button>
              ))}
            </div>

            {/* Target Engine Profile Chips for Video and Image */}
            {kind === "video" && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-purple-800/40 bg-purple-950/20 px-3.5 py-2 text-xs text-purple-200">
                <span className="font-semibold text-purple-300">Target Engine:</span>
                {[
                  { id: "universal", label: "Universal Video" },
                  { id: "veo", label: "Google Veo 3.1" },
                  { id: "kling", label: "Kling 1.5/2.0" },
                  { id: "runway", label: "Runway Gen-3" },
                ].map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setEngineTarget(eng.id as EngineTarget)}
                    className={cn(
                      "rounded px-2.5 py-0.5 font-mono text-[10px] transition cursor-pointer",
                      engineTarget === eng.id
                        ? "bg-purple-400 text-purple-950 font-bold shadow-xs ring-1 ring-purple-300"
                        : "bg-purple-900/60 border border-purple-700/50 text-purple-200 hover:bg-purple-800/70",
                    )}
                  >
                    {eng.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleInsertIdentityLock}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-900/70 transition cursor-pointer"
                  title="Insert 'The subject in the photo...' reference lock"
                >
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  + Reference Photo Lock
                </button>
              </div>
            )}
            {kind === "image" && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-sky-800/40 bg-sky-950/20 px-3.5 py-2 text-xs text-sky-200">
                <span className="font-semibold text-sky-300">Target Engine:</span>
                {[
                  { id: "universal", label: "Universal Image" },
                  { id: "midjourney", label: "Midjourney v6.1" },
                  { id: "flux", label: "Flux.1" },
                  { id: "sd", label: "Stable Diffusion" },
                ].map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setEngineTarget(eng.id as EngineTarget)}
                    className={cn(
                      "rounded px-2.5 py-0.5 font-mono text-[10px] transition cursor-pointer",
                      engineTarget === eng.id
                        ? "bg-sky-400 text-sky-950 font-bold shadow-xs ring-1 ring-sky-300"
                        : "bg-sky-900/60 border border-sky-700/50 text-sky-200 hover:bg-sky-800/70",
                    )}
                  >
                    {eng.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleInsertIdentityLock}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-900/70 transition cursor-pointer"
                  title="Insert 'The subject in the photo...' reference lock"
                >
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  + Reference Photo Lock
                </button>
              </div>
            )}

            {/* Aspect Ratio & Lens Presets Toolbar */}
            {(kind === "image" || kind === "video") && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/40 px-3 py-2 text-xs">
                <div className="flex items-center gap-1 text-[11px] font-medium text-muted-fg mr-1">
                  <Scale className="h-3.5 w-3.5 text-accent" />
                  <span className="font-semibold">Aspect Ratio:</span>
                </div>
                {["16:9", "9:16", "1:1", "2.39:1", "4:5"].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => applyPreset("ratio", ratio)}
                    className="rounded-md border border-border/80 bg-surface px-2 py-0.5 font-mono text-[10px] text-foreground hover:border-accent hover:text-accent transition cursor-pointer"
                    title={`Add aspect ratio ${ratio}`}
                  >
                    {ratio}
                  </button>
                ))}

                <div className="ml-2 hidden sm:flex items-center gap-1 text-[11px] font-medium text-muted-fg mr-1 border-l border-border/60 pl-3">
                  <Camera className="h-3.5 w-3.5 text-accent" />
                  <span className="font-semibold">Optics:</span>
                </div>
                {[
                  "35mm Street",
                  "85mm Portrait",
                  "24mm Anamorphic",
                  "FPV Low-Angle",
                  "Macro 100mm",
                ].map((lens) => (
                  <button
                    key={lens}
                    type="button"
                    onClick={() => applyPreset("lens", lens)}
                    className="hidden sm:inline-block rounded-md border border-border/80 bg-surface px-2 py-0.5 font-mono text-[10px] text-foreground hover:border-accent hover:text-accent transition cursor-pointer"
                    title={`Add lens ${lens}`}
                  >
                    {lens}
                  </button>
                ))}
              </div>
            )}

            {(kind === "image" || kind === "video") && isSubjectInPhotoPrompt(prompt) && (
              <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3.5 py-2 text-xs text-emerald-300 animate-fadeIn">
                <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="leading-tight">
                  <strong className="text-emerald-200 font-semibold">Identity Lock Rule Active:</strong> Output will enforce exact reference likeness and facial geometry.
                </span>
              </div>
            )}
          </div>

          {/* Text Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-fg">
              <label htmlFor="prompt-input" className="font-semibold uppercase tracking-wider">
                Step 2: Enter Your Prompt Draft
              </label>
              <div className="font-mono text-[11px]">
                {prompt.trim().length} chars · ~{Math.ceil(prompt.trim().split(/\s+/).filter(Boolean).length * 1.3)} tokens
              </div>
            </div>

            <div className="relative">
              <textarea
                id="prompt-input"
                className="min-h-[170px] w-full resize-y rounded-xl border border-border bg-surface/80 p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-fg/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition"
                placeholder={
                  kind === "user"
                    ? "e.g. Write a python script to scrape product prices from an e-commerce website and export to CSV. Make sure to retry on errors and handle missing fields..."
                    : kind === "system"
                    ? "e.g. You are a senior frontend developer reviewing code. Be strict about React 19 patterns, state management, and edge cases. Keep suggestions concise..."
                    : kind === "image"
                    ? "e.g. The subject in the photo... wearing a tailored black trench coat in rainy London at night, or: Cinematic photograph of a vintage cafe in Paris..."
                    : "e.g. The subject in the photo... turning towards camera with a subtle smile in a sunlit art studio, or: Veo 3.1: A young man power-sliding a supermoto motorcycle..."
                }
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
                  className="absolute right-3 top-3 rounded-md p-1.5 text-muted-fg hover:bg-surface-muted hover:text-foreground transition"
                  title="Clear prompt"
                  aria-label="Clear input"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Live Jev System One Health Audit */}
          <DiagnosticsPanel
            diagnostics={diagnostics}
            loading={diagnosing}
            onRefresh={() => fetchDiagnostics(prompt, kind)}
          />

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={loading || !prompt.trim()}
                onClick={handleOptimize}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-md hover:bg-accent-strong disabled:opacity-40 transition cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>Optimize with DeepSeek</span>
                <span className="text-[11px] font-normal opacity-85 hidden sm:inline">
                  (~1.5s)
                </span>
              </button>

              {prompt.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => openTestPlayground(prompt, "Original Prompt")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-muted transition"
                >
                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                  Test Original Live
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>

        {/* View Mode Switcher (When results are ready) */}
        {result && (
          <div className="flex items-center justify-between border-b border-border pb-2 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
                Comparison & Results
              </span>
            </div>
            <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                  viewMode === "split"
                    ? "bg-surface-muted text-foreground shadow-sm"
                    : "text-muted-fg hover:text-foreground",
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
                    ? "bg-surface-muted text-foreground shadow-sm"
                    : "text-muted-fg hover:text-foreground",
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                Word Diff
              </button>
            </div>
          </div>
        )}

        {/* Results Area */}
        {viewMode === "diff" && result ? (
          <section className="rounded-xl border border-border bg-surface/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-semibold text-foreground">
                  Exact Word Additions & Deletions
                </span>
                <p className="text-[11px] text-muted-fg">
                  Green indicates added guidelines and constraints; red indicates pruned filler.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyText(result.optimized, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted transition"
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
            {/* Original Box */}
            <div className="flex min-h-[260px] flex-col rounded-xl border border-border bg-surface/40">
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Original Prompt
                  </h3>
                  <p className="text-xs text-muted-fg">What you started with</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!prompt}
                    onClick={() => openTestPlayground(prompt, "Original Prompt")}
                    className="rounded-lg p-2 text-muted-fg hover:bg-surface-muted hover:text-foreground disabled:opacity-30 transition"
                    title="Test original prompt"
                  >
                    <Play className="h-4 w-4 text-emerald-400" />
                  </button>
                  <button
                    type="button"
                    disabled={!prompt}
                    onClick={() => copyText(prompt, false)}
                    className="rounded-lg p-2 text-muted-fg hover:bg-surface-muted hover:text-foreground disabled:opacity-30 transition"
                    title="Copy original prompt"
                  >
                    {copiedOriginal ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-relaxed text-muted-fg">
                {prompt || "—"}
              </pre>
            </div>

            {/* Optimized Box */}
            <div className="flex min-h-[260px] flex-col rounded-xl border border-accent/40 bg-accent/5">
              <div className="flex items-center justify-between border-b border-accent/20 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-accent" />
                      Optimized Prompt
                    </h3>
                    {result?.qualityGate && (
                      <span className="rounded-full bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {Math.round(result.qualityGate.intentPreserved * 100)}% Intent Match
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-fg">
                    {result ? "Production-ready rewrite" : "Click Optimize to generate"}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {result?.optimized && (
                    <button
                      type="button"
                      onClick={() => openTestPlayground(result.optimized, "Optimized Prompt")}
                      className="rounded-lg p-2 text-accent hover:bg-accent/15 transition"
                      title="Test optimized in playground"
                    >
                      <Play className="h-4 w-4 text-emerald-400" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!result?.optimized}
                    onClick={() => result && copyText(result.optimized, true)}
                    className="rounded-lg p-2 text-foreground hover:bg-surface-muted disabled:opacity-30 transition"
                    title="Copy optimized prompt"
                  >
                    {copiedOptimized ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-relaxed text-foreground">
                {result?.optimized || (
                  <span className="text-muted-fg/70">
                    Your upgraded prompt will appear here with strict boundary constraints, schema guidelines, and negative criteria.
                  </span>
                )}
              </pre>
            </div>
          </section>
        )}

        {/* Dedicated Negative Prompt Output Box */}
        {result?.negativePrompt && (
          <section className="rounded-xl border border-rose-500/30 bg-rose-950/15 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-semibold text-rose-200">
                    Negative Prompt (Artifacts, Morphing & Distortion Guards)
                  </h4>
                  <p className="text-[11px] text-rose-300/70">
                    Use in negative prompt inputs (Midjourney --no, Flux, Veo, Kling, or WebUI)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(result.negativePrompt!, false, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-900/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/70 transition cursor-pointer"
              >
                {copiedNegative ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied Negative
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Negative
                  </>
                )}
              </button>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-3 font-mono text-xs leading-relaxed text-rose-100/90">
              {result.negativePrompt}
            </pre>
          </section>
        )}

        {/* Transformation Insights (What Changed) */}
        {result && (
          <section className="space-y-4 rounded-xl border border-border bg-surface/50 p-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-accent" />
                Summary of Improvements
              </h3>
              <p className="mt-1 text-xs text-muted-fg leading-relaxed">
                {result.summary}
              </p>
            </div>

            {result.changes.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg mb-2">
                  Key Changes Made
                </h4>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {result.changes.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-border bg-background/50 p-2.5 text-xs text-foreground"
                    >
                      <span className="text-accent font-bold mt-0.5">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.qualityGate && (
              <div className="rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-fg">
                <span className="font-semibold text-foreground">Quality Verification: </span>
                Core task intent preserved at{" "}
                <span className="font-mono text-emerald-400 font-bold">
                  {Math.round(result.qualityGate.intentPreserved * 100)}%
                </span>
                . Zero harmful domain drift detected.
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border py-6 bg-surface/30">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 text-xs text-muted-fg">
          <div className="flex items-center gap-2">
            <BrandMark className="size-4" />
            <span>
              Part of the <strong className="text-foreground">NODAYSIDLE</strong> workspace · DeepSeek Flash + TypeSafe Jev
            </span>
          </div>
          <a
            href="https://github.com/nodaysidle/nodaysidle-prompt-optimizer"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition underline underline-offset-4"
          >
            GitHub Repository
          </a>
        </div>
      </footer>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={historyItems}
        onSelectPrompt={handleSelectHistoryItem}
        onRefreshHistory={refreshHistory}
      />

      <TestModal
        open={testModalState.open}
        onClose={() => setTestModalState((prev) => ({ ...prev, open: false }))}
        prompt={testModalState.prompt}
        title={testModalState.title}
      />
    </>
  );
}
