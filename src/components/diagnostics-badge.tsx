"use client";

import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { DiagnosticResult } from "@/lib/types";
import { cn } from "@/lib/cn";

export function calculatePromptHealth(diagnostics: DiagnosticResult): {
  score: number;
  label: string;
  color: "emerald" | "amber" | "rose";
} {
  const clarityPart = (diagnostics.clarityScore / 3) * 40;
  const constraintsPart = (1 - diagnostics.lacksConstraints) * 30;
  const ambiguityPart = (1 - diagnostics.isAmbiguous) * 20;
  const rolePart = (1 - diagnostics.lacksRole) * 10;

  let total = Math.round(clarityPart + constraintsPart + ambiguityPart + rolePart);
  if (diagnostics.injectionRisk > 0.5) total = Math.max(10, total - 25);
  total = Math.max(10, Math.min(100, total));

  if (total >= 75) {
    return { score: total, label: "Ready to Use", color: "emerald" };
  } else if (total >= 50) {
    return { score: total, label: "Good, but could improve", color: "amber" };
  }
  return { score: total, label: "Needs Specifics", color: "rose" };
}

export function DiagnosticsPanel({
  diagnostics,
  loading,
  onRefresh,
}: {
  diagnostics: DiagnosticResult | null;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const [showExplanation, setShowExplanation] = useState(false);

  if (!diagnostics && !loading) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/40 p-4 text-center">
        <p className="text-xs text-muted-fg flex items-center justify-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-accent" />
          Type or paste at least 15 characters to get an instant prompt health check.
        </p>
      </div>
    );
  }

  const health = diagnostics ? calculatePromptHealth(diagnostics) : null;

  return (
    <div className="rounded-xl border border-border bg-surface/70 p-4 shadow-sm transition-all">
      {/* Header & Health Gauge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-tight text-foreground">
                Prompt Health Audit
              </span>
              {loading && (
                <span className="text-[11px] text-accent animate-pulse">
                  Analyzing prompt...
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-fg">
              Instant evaluation powered by TypeSafe Jev System One
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {health && (
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface-muted px-2.5 py-1">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  health.color === "emerald" && "bg-emerald-400",
                  health.color === "amber" && "bg-amber-400",
                  health.color === "rose" && "bg-rose-400",
                )}
              />
              <span className="text-xs font-bold font-mono text-foreground">
                {health.score}/100
              </span>
              <span className="text-[11px] text-muted-fg hidden sm:inline">
                · {health.label}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowExplanation(!showExplanation)}
            className="rounded-md p-1.5 text-muted-fg hover:bg-surface-muted hover:text-foreground transition"
            title="What does this mean?"
            aria-label="Toggle explanation"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-md p-1.5 text-muted-fg hover:bg-surface-muted hover:text-foreground transition"
              title="Re-check prompt"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Explanatory Dropdown Banner */}
      {showExplanation && (
        <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs text-muted-fg leading-relaxed">
          <p className="font-medium text-foreground mb-1">
            How this audit helps you:
          </p>
          <p>
            Large language models (like ChatGPT, Claude, and DeepSeek) perform drastically better
            when given <strong>concrete constraints</strong> (output schema, word limits), <strong>clear roles</strong>,
            and <strong>unambiguous goals</strong>. This audit checks for those elements in 80 milliseconds and instructs the optimizer to fill the gaps.
          </p>
        </div>
      )}

      {/* Metric Pillars */}
      {diagnostics && (
        <div className="mt-3.5 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Clarity */}
            <div className="rounded-lg border border-border/80 bg-background/50 p-2.5">
              <span className="text-[11px] text-muted-fg block">Clarity & Goal</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-base font-bold font-mono",
                    diagnostics.clarityScore >= 2
                      ? "text-emerald-400"
                      : diagnostics.clarityScore === 1
                      ? "text-amber-400"
                      : "text-rose-400",
                  )}
                >
                  {diagnostics.clarityScore === 3
                    ? "High"
                    : diagnostics.clarityScore === 2
                    ? "Clear"
                    : diagnostics.clarityScore === 1
                    ? "Basic"
                    : "Vague"}
                </span>
                <span className="text-[10px] text-muted-fg truncate">
                  ({diagnostics.clarityScore}/3)
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-fg/80">
                {diagnostics.clarityScore >= 2
                  ? "Objective is well defined"
                  : "Needs concrete requirements"}
              </p>
            </div>

            {/* Constraints */}
            <div className="rounded-lg border border-border/80 bg-background/50 p-2.5">
              <span className="text-[11px] text-muted-fg block">Output Format</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-base font-bold font-mono",
                    diagnostics.lacksConstraints < 0.4
                      ? "text-emerald-400"
                      : "text-amber-400",
                  )}
                >
                  {diagnostics.lacksConstraints < 0.4 ? "Specified" : "Missing"}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-fg/80">
                {diagnostics.lacksConstraints < 0.4
                  ? "Formatting rules present"
                  : "No structure defined"}
              </p>
            </div>

            {/* Persona */}
            <div className="rounded-lg border border-border/80 bg-background/50 p-2.5">
              <span className="text-[11px] text-muted-fg block">AI Persona</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-base font-bold font-mono",
                    diagnostics.lacksRole < 0.4
                      ? "text-emerald-400"
                      : "text-muted-fg",
                  )}
                >
                  {diagnostics.lacksRole < 0.4 ? "Assigned" : "None"}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-fg/80">
                {diagnostics.lacksRole < 0.4
                  ? "Expert context provided"
                  : "Generic voice"}
              </p>
            </div>

            {/* Ambiguity */}
            <div className="rounded-lg border border-border/80 bg-background/50 p-2.5">
              <span className="text-[11px] text-muted-fg block">Scope Risk</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-base font-bold font-mono",
                    diagnostics.isAmbiguous < 0.4
                      ? "text-emerald-400"
                      : "text-amber-400",
                  )}
                >
                  {diagnostics.isAmbiguous < 0.4 ? "Low" : "Moderate"}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-fg/80">
                {diagnostics.isAmbiguous < 0.4
                  ? "Low risk of generic answers"
                  : "AI may guess details"}
              </p>
            </div>
          </div>

          {/* Actionable Findings & Fixes */}
          <div className="space-y-1.5 pt-1">
            {diagnostics.issues.map((issue, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg border border-amber-800/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  <strong>Missing:</strong> {issue}.{" "}
                  <span className="text-amber-300/80">
                    Clicking &ldquo;Optimize&rdquo; will automatically structure this for you.
                  </span>
                </span>
              </div>
            ))}

            {diagnostics.strengths.map((str, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border border-emerald-800/30 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>
                  <strong>Strong:</strong> {str}
                </span>
              </div>
            ))}

            {diagnostics.injectionRisk > 0.5 && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-800/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  <strong>Security Note:</strong> Detected phrases often associated with prompt injection or overrides.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
