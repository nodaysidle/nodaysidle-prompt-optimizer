"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
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
  const [typesafeKeyDraft, setTypesafeKeyDraft] = useState(settings.typesafeApiKey || "");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  function saveDeepSeekKey() {
    updateSetting("deepseekApiKey", deepseekKeyDraft.trim());
    setTestStatus("DeepSeek API key saved locally.");
    setTimeout(() => setTestStatus(null), 3000);
  }

  function saveTypesafeKey() {
    updateSetting("typesafeApiKey", typesafeKeyDraft.trim());
    setTestStatus("TypeSafe Jev API key saved locally.");
    setTimeout(() => setTestStatus(null), 3000);
  }

  async function testDeepSeekConnection() {
    const key = deepseekKeyDraft.trim() || settings.deepseekApiKey;
    if (!key) {
      setTestStatus("Enter an API key first.");
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
        <h2 className="flex items-center gap-2 text-xl font-semibold text-zinc-50">
          <KeyRound className="h-5 w-5 text-violet-400" />
          API & Model Settings
        </h2>
        <p className="mt-1 flex items-start gap-2 text-sm text-zinc-400">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          Credentials are saved in your browser&apos;s localStorage and sent securely via
          Next.js edge routes. You can also set{" "}
          <code className="text-violet-300">DEEPSEEK_API_KEY</code> and{" "}
          <code className="text-violet-300">TYPESAFE_API_KEY</code> in server environment variables on Vercel.
        </p>
      </div>

      {testStatus && (
        <div
          className={cn(
            "rounded-lg p-3 text-xs font-medium",
            testStatus.startsWith("✓")
              ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
              : testStatus.startsWith("✗")
              ? "bg-rose-950/60 text-rose-300 border border-rose-800"
              : "bg-zinc-900 text-zinc-300 border border-zinc-700",
          )}
        >
          {testStatus}
        </div>
      )}

      {/* DeepSeek Platform Card */}
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-zinc-100 flex items-center gap-2">
              DeepSeek Platform API
              <span className="rounded bg-violet-950 px-2 py-0.5 text-[11px] font-semibold text-violet-400 border border-violet-800/60">
                Primary Engine
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              High-speed reasoning & rewrites via{" "}
              <a
                href="https://platform.deepseek.com"
                target="_blank"
                rel="noreferrer"
                className="text-violet-400 underline hover:text-violet-300"
              >
                api.deepseek.com
              </a>
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400 sm:col-span-2">
            Model ID
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={settings.deepseekModel}
                onChange={(e) => updateSetting("deepseekModel", e.target.value)}
                placeholder="e.g. deepseek-chat or deepseek-v4.1-flash"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono"
              />
              <select
                value={settings.deepseekModel}
                onChange={(e) => updateSetting("deepseekModel", e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"
              >
                <option value="deepseek-chat">deepseek-chat (Default)</option>
                <option value="deepseek-v4.1-flash">deepseek-v4.1-flash</option>
                <option value="deepseek-reasoner">deepseek-reasoner (R1)</option>
              </select>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              On official <code className="text-zinc-400">api.deepseek.com</code>, <code className="text-violet-300">deepseek-chat</code> serves the latest ultra-fast V3 model. Routers/aggregators often use <code className="text-violet-300">deepseek-v4.1-flash</code>.
            </p>
          </label>

          <div className="sm:col-span-2 space-y-1">
            <label className="block text-xs text-zinc-400">
              DeepSeek API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="sk-..."
                value={deepseekKeyDraft}
                onChange={(e) => setDeepseekKeyDraft(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
              />
              <button
                type="button"
                onClick={saveDeepSeekKey}
                className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
              >
                Save
              </button>
              <button
                type="button"
                disabled={testLoading}
                onClick={testDeepSeekConnection}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition"
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
                <CheckCircle2 className="h-3 w-3" /> Key saved locally in browser
              </p>
            )}
          </div>
        </div>
      </div>

      {/* TypeSafe Jev Diagnostics Card */}
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div>
          <h3 className="font-medium text-zinc-100 flex items-center gap-2">
            TypeSafe Jev
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-800/60">
              System One Judge
            </span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ultra-fast probabilistic rubric judgments, ambiguity detection, and output quality verification.
            If left blank, built-in deterministic heuristic diagnostics will be used.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-zinc-400">
            TypeSafe API Key (Optional)
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="ts-..."
              value={typesafeKeyDraft}
              onChange={(e) => setTypesafeKeyDraft(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
            />
            <button
              type="button"
              onClick={saveTypesafeKey}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
            >
              Save
            </button>
          </div>
          {settings.typesafeApiKey && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1">
              <CheckCircle2 className="h-3 w-3" /> TypeSafe Jev active
            </p>
          )}
        </div>

        <div className="pt-2">
          <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoDiagnose}
              onChange={(e) => updateSetting("autoDiagnose", e.target.checked)}
              className="rounded border-zinc-700 text-violet-600 focus:ring-violet-500"
            />
            Automatically run diagnostics when typing or pasting prompts
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
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <span className="text-sm font-semibold text-zinc-200">Configuration</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
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
        <Link href="/" className="text-sm text-violet-400 hover:text-violet-300">
          ← Back to optimizer
        </Link>
      </p>
      <SettingsContent />
    </div>
  );
}
