import { beforeEach, vi } from "vitest";
beforeEach(() => {
  if (typeof window !== "undefined") {
    // Recent Node localStorage shadows jsdom's getter; use a complete in-memory Storage implementation.
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(String(key), String(value)); },
    };
    vi.stubGlobal("localStorage", storage);
  }
});
