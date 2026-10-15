"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Shield,
  X,
} from "lucide-react";
import { useSettings } from "@/lib/settings-context";
import { cn } from "@/lib/cn";

export function SettingsContent({ className }: { className?: string }) {
  const { settings, updateSetting } = useSettings();
  const [deepseekKeyDraft, setDeepseekKeyDraft] = useState(settings.deepseekApiKey || "");
  const [openrouterKeyDraft, setOpenrouterKeyDraft] = useState(settings.openrouterApiKey || "");
  const [typesafeKeyDraft, setTypesafeKeyDraft] = useState(settings.typesafeApiKey || "");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  function saveDeepSeekKey() {
    updateSetting("deepseekApiKey", deepseekKeyDraft.trim());
    setTestStatus("DeepSeek API key saved in browser localStorage.");
    setTimeout(() => setTestStatus(null), 3000);
  }

  function saveOpenrouterKey() {
    updateSetting("openrouterApiKey", openrouterKeyDraft.trim());
    setTestStatus("OpenRouter (Microsoft-Decision-1) key saved in browser localStorage.");
    setTimeout(() => setTestStatus(null), 3000);
  }

  function saveTypesafeKey() {
    updateSetting("typesafeApiKey", typesafeKeyDraft.trim());
    setTestStatus("TypeSafe Jev API key saved in browser localStorage.");
    setTimeout(() => setTestStatus(null), 3000);
  }

  async function testDeepSeekConnection() {
    const key = deepseekKeyDraft.trim() || settings.deepseekApiKey;
    if (!key) {
      setTestStatus("Please enter an API key first.");
      return;
    }
    setTestLoading(true);
    setTestStatus(null);
    try {
      const res = await fetch("/api/test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-deepseek-key": key,
        },
        body: JSON.stringify({
          prompt: "Say 'DeepSeek connected successfully' in 5 words.",
          model: settings.deepseekModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setTestStatus("✓ DeepSeek platform connected successfully!");
    } catch (err) {
      setTestStatus(err instanceof Error ? `✗ ${err.message}` : "✗ Connection failed");
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <KeyRound className="h-5 w-5 text-accent" />
          API & Engine Settings
        </h2>
        <p className="mt-1 flex items-start gap-2 text-xs text-muted-fg leading-relaxed">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          Keys stay in your browser&apos;s local storage and are proxied over HTTPS directly
          to the providers via Next.js edge routes. No keys are logged or stored on any third-party server.
        </p>
      </div>

      {testStatus && (
        <div
          className={cn(
            "rounded-xl p-3 text-xs font-medium transition",
            testStatus.startsWith("✓")
              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
              : testStatus.startsWith("✗")
              ? "bg-rose-950/60 text-rose-300 border border-rose-800"
              : "bg-surface-muted text-muted-fg border border-border",
          )}
        >
          {testStatus}
        </div>
      )}

      {/* DeepSeek Platform Card */}
      <div className="space-y-4 rounded-xl border border-border bg-surface/70 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
              DeepSeek Platform API
              <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/20">
                Rewriter Engine
              </span>
            </h3>
            <p className="text-xs text-muted-fg mt-0.5">
              Powers prompt rewriting and playground test executions.
            </p>
          </div>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
          >
            Get API Key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-foreground">
              DeepSeek API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="sk-..."
                value={deepseekKeyDraft}
                onChange={(e) => setDeepseekKeyDraft(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-fg focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={saveDeepSeekKey}
                className="rounded-lg border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground hover:border-accent transition"
              >
                Save
              </button>
              <button
                type="button"
                disabled={testLoading}
                onClick={testDeepSeekConnection}
                className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-strong disabled:opacity-50 transition"
              >
                {testLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Test Connection"
                )}
              </button>
            </div>
            {settings.deepseekApiKey && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3" /> API Key saved in this browser
              </p>
            )}
          </div>

          <label className="block text-xs text-muted-fg pt-1">
            <span className="font-medium text-foreground block mb-1">Model Selection</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.deepseekModel}
                onChange={(e) => updateSetting("deepseekModel", e.target.value)}
                placeholder="e.g. deepseek-chat"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground font-mono focus:border-accent focus:outline-none"
              />
              <select
                value={settings.deepseekModel}
                onChange={(e) => updateSetting("deepseekModel", e.target.value)}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="deepseek-chat">deepseek-chat (V3 Flash · Recommended)</option>
                <option value="deepseek-reasoner">deepseek-reasoner (R1 Reasoning)</option>
                <option value="deepseek-v4.1-flash">deepseek-v4.1-flash (Router)</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-muted-fg">
              <code className="text-foreground">deepseek-chat</code> is the default high-speed flagship model on the official platform.
            </p>
          </label>
        </div>
      </div>

      {/* Microsoft-Decision-1 / OpenRouter Diagnostics Card */}
      <div className="space-y-4 rounded-xl border border-border bg-surface/70 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
              Microsoft-Decision-1
              <span className="rounded bg-sky-950/80 px-2 py-0.5 text-[10px] font-semibold text-sky-300 border border-sky-800/80">
                85ms Sub-100ms Linter
              </span>
            </h3>
            <p className="text-xs text-muted-fg mt-0.5">
              High-throughput decision model via OpenRouter for ultra-fast snap diagnostics & quality gating.
            </p>
          </div>
          <a
            href="https://openrouter.ai/microsoft/microsoft-decision-1"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
          >
            OpenRouter Info
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-foreground">
            OpenRouter API Key <span className="text-muted-fg font-normal">(Primary Fast Decision Engine)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="sk-or-v1-..."
              value={openrouterKeyDraft}
              onChange={(e) => setOpenrouterKeyDraft(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={saveOpenrouterKey}
              className="rounded-lg border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground hover:border-accent transition"
            >
              Save
            </button>
          </div>
          <p className="text-[11px] text-muted-fg">
            Runs Microsoft-Decision-1 at 85ms median latency ($0.042/1M tokens, free output tokens).
          </p>
        </div>
      </div>

      {/* TypeSafe Jev Diagnostics Card */}
      <div className="space-y-4 rounded-xl border border-border bg-surface/70 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
              TypeSafe Jev
              <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800/80">
                System One Fallback
              </span>
            </h3>
            <p className="text-xs text-muted-fg mt-0.5">
              Secondary calibrated probabilistic engine for rubric scoring and intent verification.
            </p>
          </div>
          <a
            href="https://typesafe.ai"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
          >
            TypeSafe Info
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-foreground">
            TypeSafe API Key <span className="text-muted-fg font-normal">(Optional Fallback)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="ts-..."
              value={typesafeKeyDraft}
              onChange={(e) => setTypesafeKeyDraft(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-fg focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={saveTypesafeKey}
              className="rounded-lg border border-border bg-surface-muted px-3.5 py-2 text-xs font-semibold text-foreground hover:border-accent transition"
            >
              Save
            </button>
          </div>
          {settings.typesafeApiKey && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3" /> API Key saved in this browser
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Diagnostic Engine Preference
              </label>
              <select
                value={settings.preferredEngine || "auto"}
                onChange={(e) =>
                  updateSetting(
                    "preferredEngine",
                    e.target.value as "auto" | "jev" | "decision-1",
                  )
                }
                className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="auto">Auto (Prioritize available key)</option>
                <option value="jev">TypeSafe Jev (Immediate 1.14)</option>
                <option value="decision-1">Microsoft-Decision-1 (OpenRouter)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                TypeSafe Jev Model
              </label>
              <select
                value={settings.typesafeModel || "jev-preview"}
                onChange={(e) => updateSetting("typesafeModel", e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-foreground font-mono focus:border-accent focus:outline-none"
              >
                <option value="jev-preview">jev-preview (Jev 1.14 · Active)</option>
                <option value="jev-1.14.0">jev-1.14.0 (Direct Pin)</option>
                <option value="jev-latest">jev-latest (Current default)</option>
                <option value="jev-1.13.0">jev-1.13.0 (Legacy)</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-muted-fg">
            <code className="text-foreground">jev-preview</code> gives you immediate access to Jev 1.14.0 without waiting for the 1-week alias rollover.
          </p>
        </div>

        <div className="pt-2 border-t border-border/60">
          <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoDiagnose}
              onChange={(e) => updateSetting("autoDiagnose", e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            Automatically audit prompts in real-time as you type or paste
          </label>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <span className="text-sm font-bold text-foreground">Configuration</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-fg hover:bg-surface-muted hover:text-foreground transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SettingsContent />
      </div>
    </div>
  );
}

export function SettingsPageView() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="mb-6">
        <Link href="/" className="text-sm text-accent hover:underline flex items-center gap-1.5 font-medium">
          ← Back to Prompt Optimizer
        </Link>
      </p>
      <SettingsContent />
    </div>
  );
}
