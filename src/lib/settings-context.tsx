"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  forgetLegacySettings,
  forgetSettings,
  importLegacySettings,
  inspectLegacySettings,
  loadSettings,
  NO_LEGACY_SETTINGS,
  saveSettings,
  type LegacySettingsInfo,
} from "./storage";
import { DEFAULT_SETTINGS, type AppSettings, type ServerConfig } from "./types";

interface SettingsContextValue {
  settings: AppSettings;
  setSettings: (next: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  forget: () => void;
  error: string | null;
  hydrated: boolean;
  server: ServerConfig | null;
  legacy: LegacySettingsInfo;
  importLegacy: () => AppSettings | null;
  forgetLegacy: () => boolean;
}
const SettingsContext = createContext<SettingsContextValue | null>(null);
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setValue] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [server, setServer] = useState<ServerConfig | null>(null);
  const [legacy, setLegacy] = useState(NO_LEGACY_SETTINGS);
  useEffect(() => {
    const controller = new AbortController();
    const bootstrap = async () => {
      // Browser persistence is loaded only after client hydration, never during SSR.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      try {
        setValue(loadSettings());
        setLegacy(inspectLegacySettings());
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Browser storage unavailable.",
        );
      }
      setHydrated(true);
    };
    void bootstrap();
    fetch("/api/config", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Server connection status unavailable.");
        setServer(await res.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Server connection status unavailable.");
      });
    return () => controller.abort();
  }, []);
  function setSettings(next: AppSettings) {
    setValue(next);
    try {
      saveSettings(next);
      setError(null);
    } catch {
      setError(
        "Settings work for this session, but browser storage could not be updated.",
      );
    }
  }
  function forget() {
    setValue({ ...DEFAULT_SETTINGS });
    try {
      forgetSettings();
      setLegacy({ ...NO_LEGACY_SETTINGS });
      setError(null);
    } catch {
      setError(
        "Session access forgotten, but saved browser credentials could not be removed. Clear site data in your browser.",
      );
    }
  }
  function importLegacy() {
    try {
      const imported = importLegacySettings();
      setValue(imported);
      setError(null);
      return imported;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Legacy credentials could not be read. Saved data is unchanged.",
      );
      return null;
    }
  }
  function forgetLegacy() {
    try {
      forgetLegacySettings();
      setLegacy({ ...NO_LEGACY_SETTINGS });
      setError(null);
      return true;
    } catch {
      setError(
        "Legacy saved credentials could not be removed. The saved copy remains; check browser storage permissions.",
      );
      return false;
    }
  }
  return (
    <SettingsContext.Provider
      value={{
        settings,
        setSettings,
        updateSetting: (key, value) =>
          setSettings({ ...settings, [key]: value }),
        forget,
        error,
        hydrated,
        server,
        legacy,
        importLegacy,
        forgetLegacy,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("Settings provider is required.");
  return value;
}
export function requestHeaders(settings: AppSettings) {
  return {
    "Content-Type": "application/json",
    "x-deepseek-key": settings.deepseekApiKey,
    "x-openrouter-key": settings.openrouterApiKey,
    "x-typesafe-key": settings.typesafeApiKey,
    "x-app-access-token": settings.appAccessToken,
  };
}
