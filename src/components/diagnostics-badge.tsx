"use client";

import { AlertTriangle, CheckCircle2, Gauge, ShieldAlert } from "lucide-react";
import type { DiagnosticResult } from "@/lib/types";
import { cn } from "@/lib/cn";

export function DiagnosticsPanel({
  diagnostics,
  loading,
  onRefresh,
}: {
  diagnostics: DiagnosticResult | null;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  if (!diagnostics && !loading) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-all">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
            <Gauge className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Jev System One Diagnostics
          </span>
          {loading && (
            <span className="text-xs text-violet-400 animate-pulse">
              evaluating...
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            Re-evaluate
          </button>
        )}
      </div>

      {diagnostics && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Clarity Rubric */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
              <span className="text-[11px] text-zinc-500">Clarity Rubric</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-lg font-bold font-mono",
                    diagnostics.clarityScore >= 2
                      ? "text-emerald-400"
                      : diagnostics.clarityScore === 1
                      ? "text-amber-400"
                      : "text-rose-400",
                  )}
                >
                  {diagnostics.clarityScore}/3
                </span>
                <span className="text-[11px] text-zinc-400 truncate">
                  {diagnostics.clarityLabel}
                </span>
              </div>
            </div>

            {/* Ambiguity Probability */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
              <span className="text-[11px] text-zinc-500">Ambiguity</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-lg font-bold font-mono",
                    diagnostics.isAmbiguous < 0.4
                      ? "text-emerald-400"
                      : "text-amber-400",
                  )}
                >
                  {Math.round(diagnostics.isAmbiguous * 100)}%
                </span>
                <span className="text-[11px] text-zinc-400">
                  {diagnostics.isAmbiguous < 0.4 ? "Well-scoped" : "Uncertain"}
                </span>
              </div>
            </div>

            {/* Constraints Missing */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
              <span className="text-[11px] text-zinc-500">Missing Constraints</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-lg font-bold font-mono",
                    diagnostics.lacksConstraints < 0.4
                      ? "text-emerald-400"
                      : "text-rose-400",
                  )}
                >
                  {Math.round(diagnostics.lacksConstraints * 100)}%
                </span>
                <span className="text-[11px] text-zinc-400">
                  {diagnostics.lacksConstraints < 0.4 ? "Defined" : "Needs rules"}
                </span>
              </div>
            </div>

            {/* Role & Persona */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
              <span className="text-[11px] text-zinc-500">Persona / Boundary</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-lg font-bold font-mono",
                    diagnostics.lacksRole < 0.4
                      ? "text-emerald-400"
                      : "text-zinc-400",
                  )}
                >
                  {diagnostics.lacksRole < 0.4 ? "Present" : "Missing"}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {diagnostics.lacksRole < 0.4 ? "Bound" : "Generic"}
                </span>
              </div>
            </div>
          </div>

          {/* Issues and Strengths */}
          <div className="flex flex-wrap gap-2 pt-1">
            {diagnostics.issues.map((issue, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/30 px-2.5 py-1 text-xs text-amber-300"
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {issue}
              </span>
            ))}
            {diagnostics.strengths.map((str, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-1 text-xs text-emerald-300"
              >
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {str}
              </span>
            ))}
            {diagnostics.injectionRisk > 0.5 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-800/40 bg-rose-950/30 px-2.5 py-1 text-xs text-rose-300">
                <ShieldAlert className="h-3 w-3 shrink-0" />
                Jailbreak pattern warning ({Math.round(diagnostics.injectionRisk * 100)}%)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
