"use client";
import { useState } from "react";
import type { PromptHistoryItem } from "@/lib/types";
import {
  clearHistory,
  deleteHistoryItem,
  toggleFavoriteHistoryItem,
} from "@/lib/storage";
import { KIND_LABEL, MODE_LABEL } from "@/lib/labels";
import { PROFILES } from "@/lib/profiles";
import { Dialog } from "./dialog";
interface Props {
  open: boolean;
  onClose: () => void;
  items: PromptHistoryItem[];
  onSelectPrompt: (item: PromptHistoryItem) => void;
  onRefreshHistory: () => void;
}
function HistoryContent({
  items,
  onSelectPrompt,
  onRefreshHistory,
}: Omit<Props, "open" | "onClose">) {
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  function action(fn: () => unknown) {
    try {
      fn();
      onRefreshHistory();
      setError("");
    } catch {
      setError(
        "History could not be updated. Browser storage may be full or disabled.",
      );
    }
  }
  const filtered = items.filter(
    (item) =>
      (!favorites || item.isFavorite) &&
      `${item.original} ${item.optimized} ${item.finalPrompt}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <p className="help">
        Saved locally on this browser. Favorites survive recent-history
        eviction. A loaded run keeps the check it had when it ran.
      </p>

      {!items.length ? (
        <div className="history-empty">
          <p>No saved prompts yet.</p>
          <p className="help">
            Each run you make is saved here, with its original prompt and the
            final text. Favorites are kept when older runs are evicted.
          </p>
        </div>
      ) : (
        <>
          <label htmlFor="history-search">Search history</label>
          <input
            id="history-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="action-row">
            <button
              aria-pressed={favorites}
              onClick={() => setFavorites(!favorites)}
            >
              Favorites only
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={confirmClear}
            >
              Clear history
            </button>
          </div>

          {confirmClear && (
            <div className="history-confirm" role="alert">
              <p>Delete all local history, including favorites?</p>
              <div className="action-row">
                <button
                  type="button"
                  onClick={() => {
                    action(clearHistory);
                    setConfirmClear(false);
                  }}
                >
                  Delete everything
                </button>
                <button type="button" onClick={() => setConfirmClear(false)}>
                  Keep history
                </button>
              </div>
            </div>
          )}

          {error && <p role="alert">{error}</p>}

          {!filtered.length ? (
            <div className="history-empty">
              <p>No saved prompts match this view.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFavorites(false);
                }}
              >
                Show all saved prompts
              </button>
            </div>
          ) : (
            filtered.map((item) => (
              <article className="history-item" key={item.id}>
                <p className="help">
                  {KIND_LABEL[item.kind]} · {MODE_LABEL[item.mode]} ·{" "}
                  {PROFILES[item.engineTarget].label} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                <p className="history-preview">
                  {item.finalPrompt.trim()
                    ? item.finalPrompt
                    : "(empty final prompt)"}
                </p>
                <div className="action-row">
                  <button onClick={() => onSelectPrompt(item)}>
                    Load saved prompt
                  </button>
                  <button
                    aria-pressed={item.isFavorite}
                    onClick={() =>
                      action(() => toggleFavoriteHistoryItem(item.id))
                    }
                  >
                    {item.isFavorite ? "Unfavorite" : "Favorite"}
                  </button>
                  <button
                    onClick={() => action(() => deleteHistoryItem(item.id))}
                  >
                    Delete
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(item.finalPrompt);
                        setCopiedId(item.id);
                        window.setTimeout(() => setCopiedId(null), 1600);
                      } catch {
                        setError(
                          "Clipboard unavailable. Select and copy the text manually.",
                        );
                      }
                    }}
                  >
                    {copiedId === item.id ? "Copied" : "Copy saved prompt"}
                  </button>
                </div>
              </article>
            ))
          )}
        </>
      )}
    </>
  );
}
export function HistoryDrawer(props: Props) {
  return props.open ? (
    <Dialog title="History" onClose={props.onClose}>
      <HistoryContent {...props} />
    </Dialog>
  ) : null;
}
