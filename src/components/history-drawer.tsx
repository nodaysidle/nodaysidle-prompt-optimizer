"use client";
import { useState } from "react";
import type { PromptHistoryItem } from "@/lib/types";
import {
  clearHistory,
  deleteHistoryItem,
  toggleFavoriteHistoryItem,
} from "@/lib/storage";
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
      `${item.original} ${item.optimized}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <p className="help">
        Saved locally on this browser. Favorites are protected from rolling
        recent-history eviction. Restored checks are historical, not fresh
        verification.
      </p>
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
          disabled={!items.length}
          onClick={() => {
            if (confirm("Delete all local history including favorites?"))
              action(clearHistory);
          }}
        >
          Clear history
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!filtered.length && <p>No matching saved prompts.</p>}
      {filtered.map((item) => (
        <article className="history-item" key={item.id}>
          <p className="help">
            {item.kind} · {item.mode} · {item.profileVersion} ·{" "}
            {new Date(item.createdAt).toLocaleString()}
          </p>
          <p>{item.optimized}</p>
          <div className="action-row">
            <button onClick={() => onSelectPrompt(item)}>
              Load saved prompt
            </button>
            <button
              aria-pressed={item.isFavorite}
              onClick={() => action(() => toggleFavoriteHistoryItem(item.id))}
            >
              {item.isFavorite ? "Unfavorite" : "Favorite"}
            </button>
            <button onClick={() => action(() => deleteHistoryItem(item.id))}>
              Delete
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(item.optimized);
                  setError("Copied saved candidate.");
                } catch {
                  setError(
                    "Clipboard unavailable. Select and copy the text manually.",
                  );
                }
              }}
            >
              Copy saved candidate
            </button>
          </div>
        </article>
      ))}
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
