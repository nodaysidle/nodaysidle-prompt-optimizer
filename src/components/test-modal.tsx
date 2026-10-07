"use client";

import { useState } from "react";
import { Loader2, Play, Terminal, X, Copy, Check } from "lucide-react";
import { useSettings } from "@/lib/settings-context";

interface TestModalProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  title?: string;
}

export function TestModal({ open, onClose, prompt, title = "Test Prompt in Playground" }: TestModalProps) {
  const { settings } = useSettings();
  const [testInput, setTestInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleRun() {
    setLoading(true);
    setError(null);
    setOutput(null);

    try {
      const res = await fetch("/api/test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-deepseek-key": settings.deepseekApiKey || "",
        },
        body: JSON.stringify({
          prompt,
          testInput,
          model: settings.deepseekModel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Execution failed");
      }
      setOutput(data.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test execution failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
              <p className="text-xs text-zinc-400">
                Running via DeepSeek platform ({settings.deepseekModel})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400">Active Prompt</label>
            <pre className="mt-1 max-h-36 overflow-auto rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3 font-mono text-xs text-zinc-300">
              {prompt}
            </pre>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Sample User Input / Task Payload (Optional)
            </label>
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="e.g. Find all inactive users who have not logged in for 90 days..."
              className="mt-1 h-20 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900/70 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={loading}
              onClick={handleRun}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run Live Test
            </button>
            {error && <span className="text-xs text-rose-400">{error}</span>}
          </div>

          {output && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-zinc-400">
                  Model Response
                </span>
                <button
                  type="button"
                  onClick={copyOutput}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Output
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200">
                {output}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
