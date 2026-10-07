"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { loadSettings, saveSettings } from "./storage";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";

interface SettingsContextValue {
  settings: AppSettings;
  setSettings: (next: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  hydrated: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

let settingsCache: AppSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSettingsSnapshot(): AppSettings {
  return settingsCache;
}

function getServerSnapshot(): AppSettings {
  return DEFAULT_SETTINGS;
}

const clientMountedSubscribe = () => () => {};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(
    subscribe,
    getSettingsSnapshot,
    getServerSnapshot,
  );

  const hydrated = useSyncExternalStore(
    clientMountedSubscribe,
    () => true,
    () => false,
  );

  const setSettings = useCallback((next: AppSettings) => {
    settingsCache = next;
    saveSettings(next);
    emitChange();
  }, []);

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const current = loadSettings();
      const updated = { ...current, [key]: value };
      setSettings(updated);
    },
    [setSettings],
  );

  const value = useMemo(
    () => ({ settings, setSettings, updateSetting, hydrated }),
    [settings, setSettings, updateSetting, hydrated],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

if (typeof window !== "undefined") {
  settingsCache = loadSettings();
}
