"use client";

import { useState } from "react";
import { Loader2, Play, Terminal, X, Copy, Check, Sparkles } from "lucide-react";
import { useSettings } from "@/lib/settings-context";

interface TestModalProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  title?: string;
}

export function TestModal({
  open,
  onClose,
  prompt,
  title = "Test Prompt in Playground",
}: TestModalProps) {
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
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">{title}</h3>
              <p className="text-xs text-muted-fg">
                Live execution test via DeepSeek Platform ({settings.deepseekModel})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-fg hover:bg-surface-muted hover:text-foreground transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-fg">
              Active Prompt Being Tested
            </label>
            <pre className="mt-1.5 max-h-36 overflow-auto rounded-xl border border-border bg-surface/60 p-3 font-mono text-xs text-foreground/90 leading-relaxed">
              {prompt}
            </pre>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-fg">
              Sample User Input / Scenario Payload (Optional)
            </label>
            <textarea
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="e.g. Find all inactive users who have not logged in for 90 days, return as JSON..."
              className="mt-1.5 h-20 w-full resize-none rounded-xl border border-border bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-fg/60 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={loading}
              onClick={handleRun}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground shadow hover:bg-accent-strong disabled:opacity-50 transition cursor-pointer"
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
            <div className="space-y-2 rounded-xl border border-border bg-surface/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Live Model Response
                </span>
                <button
                  type="button"
                  onClick={copyOutput}
                  className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-foreground transition"
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
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
                {output}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
