"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  Star,
  Trash2,
  X,
  Search,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import type { PromptHistoryItem } from "@/lib/types";
import {
  toggleFavoriteHistoryItem,
  deleteHistoryItem,
  clearHistory,
} from "@/lib/storage";

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  items: PromptHistoryItem[];
  onSelectPrompt: (item: PromptHistoryItem) => void;
  onRefreshHistory: () => void;
}

function formatPromptDate(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })} · ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return "";
  }
}

export function HistoryDrawer({
  open,
  onClose,
  items,
  onSelectPrompt,
  onRefreshHistory,
}: HistoryDrawerProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === "favorites" && !item.isFavorite) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.original.toLowerCase().includes(q) ||
        item.optimized.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  if (!open) return null;

  function handleToggleStar(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    toggleFavoriteHistoryItem(id);
    onRefreshHistory();
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteHistoryItem(id);
    onRefreshHistory();
  }

  function handleClearAll() {
    if (confirm("Clear all prompt history?")) {
      clearHistory();
      onRefreshHistory();
    }
  }

  async function handleCopy(e: React.MouseEvent, id: string, text: string) {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                History & Favorites
              </h3>
              <p className="text-[11px] text-muted-fg">
                {items.length} saved local prompts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-fg hover:bg-surface-muted hover:text-foreground transition cursor-pointer"
            aria-label="Close history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="space-y-2 border-b border-border p-4 bg-surface/40">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-fg" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search past prompts..."
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-fg/60 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                  filter === "all"
                    ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                    : "text-muted-fg hover:text-foreground"
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("favorites")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                  filter === "favorites"
                    ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                    : "text-muted-fg hover:text-foreground"
                }`}
              >
                <Star className="h-3 w-3 fill-current text-amber-400" />
                Starred ({items.filter((i) => i.isFavorite).length})
              </button>
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] text-muted-fg hover:text-rose-400 transition cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* List of items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-fg">
              {search || filter === "favorites"
                ? "No matching prompts found."
                : "No saved prompts yet. Optimized prompts will appear here automatically."}
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectPrompt(item)}
                className="group relative flex flex-col gap-2 rounded-xl border border-border bg-surface/60 p-3.5 hover:border-accent/50 hover:bg-surface transition cursor-pointer"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-accent/15 px-2 py-0.5 font-semibold text-accent capitalize">
                      {item.kind}
                    </span>
                    {item.engineTarget && item.engineTarget !== "universal" && (
                      <span className="rounded bg-surface-muted border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-fg uppercase">
                        {item.engineTarget}
                      </span>
                    )}
                    <span className="text-muted-fg">{formatPromptDate(item.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleToggleStar(e, item.id)}
                      className="rounded-md p-1 text-muted-fg hover:text-amber-400 transition cursor-pointer"
                      title={item.isFavorite ? "Unstar" : "Star favorite"}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          item.isFavorite
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-fg"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, item.id, item.optimized)}
                      className="rounded-md p-1 text-muted-fg hover:text-foreground transition cursor-pointer"
                      title="Copy optimized prompt"
                    >
                      {copiedId === item.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, item.id)}
                      className="rounded-md p-1 text-muted-fg hover:text-rose-400 transition cursor-pointer"
                      title="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Prompt Preview */}
                <div className="space-y-1">
                  <p className="line-clamp-2 font-mono text-xs text-foreground/90 leading-relaxed">
                    {item.optimized}
                  </p>
                  <p className="line-clamp-1 text-[11px] text-muted-fg italic">
                    Original: &ldquo;{item.original}&rdquo;
                  </p>
                </div>

                {/* Footer Action */}
                <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-fg">
                  <span className="line-clamp-1">{item.summary}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-accent group-hover:translate-x-0.5 transition shrink-0 ml-2">
                    Load <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
