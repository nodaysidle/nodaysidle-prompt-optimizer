"use client";

import { useMemo } from "react";
import { diffWords, Change } from "diff";
import { cn } from "@/lib/cn";

interface DiffViewerProps {
  original: string;
  optimized: string;
  className?: string;
}

export function DiffViewer({ original, optimized, className }: DiffViewerProps) {
  const { changes, additions, deletions } = useMemo(() => {
    if (!original && !optimized) {
      return { changes: [] as Change[], additions: 0, deletions: 0 };
    }
    const diff = diffWords(original || "", optimized || "");
    let addCount = 0;
    let delCount = 0;

    diff.forEach((part) => {
      if (part.added) addCount += (part.value.match(/\S+/g) || []).length;
      if (part.removed) delCount += (part.value.match(/\S+/g) || []).length;
    });

    return { changes: diff, additions: addCount, deletions: delCount };
  }, [original, optimized]);

  if (!optimized) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
        Run optimization to see interactive word-level diff
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
        <span className="inline-flex items-center gap-1.5 text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          +{additions} words added
        </span>
        <span className="inline-flex items-center gap-1.5 text-rose-400">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          -{deletions} words removed
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap select-text">
        {changes.map((part, index) => {
          if (part.added) {
            return (
              <span
                key={index}
                className="rounded bg-emerald-950/70 text-emerald-300 font-medium px-1 py-0.5 border border-emerald-800/60"
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={index}
                className="rounded bg-rose-950/60 text-rose-300/80 line-through px-1 py-0.5 border border-rose-900/40 opacity-70"
              >
                {part.value}
              </span>
            );
          }
          return <span key={index} className="text-zinc-300">{part.value}</span>;
        })}
      </div>
    </div>
  );
}
