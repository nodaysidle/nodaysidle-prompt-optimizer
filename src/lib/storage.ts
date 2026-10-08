import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type PromptHistoryItem,
} from "./types";

const STORAGE_KEY = "prompt-optimizer-settings-v2";
const HISTORY_KEY = "prompt-optimizer-history-v1";
const MAX_HISTORY = 30;

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore localstorage errors
  }
}

export function loadHistory(): PromptHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PromptHistoryItem[];
  } catch {
    return [];
  }
}

export function saveHistoryItem(
  item: Omit<PromptHistoryItem, "id" | "createdAt" | "isFavorite">,
): PromptHistoryItem {
  const current = loadHistory();
  const newItem: PromptHistoryItem = {
    ...item,
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    isFavorite: false,
  };
  const updated = [
    newItem,
    ...current.filter(
      (h) => h.original !== item.original || h.kind !== item.kind,
    ),
  ].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return newItem;
}

export function toggleFavoriteHistoryItem(id: string): PromptHistoryItem[] {
  const current = loadHistory();
  const updated = current.map((item) =>
    item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
  );
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function deleteHistoryItem(id: string): PromptHistoryItem[] {
  const current = loadHistory();
  const updated = current.filter((item) => item.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
