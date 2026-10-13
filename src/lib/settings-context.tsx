"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { forgetSettings, loadSettings, saveSettings } from "./storage";
import { DEFAULT_SETTINGS, type AppSettings, type ServerConfig } from "./types";

interface SettingsContextValue {
  settings: AppSettings; setSettings: (next: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  forget: () => void; error: string | null; hydrated: boolean; server: ServerConfig | null;
}
const SettingsContext = createContext<SettingsContextValue | null>(null);
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setValue] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [server, setServer] = useState<ServerConfig | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const bootstrap = async () => {
      // Browser persistence is loaded only after client hydration, never during SSR.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      try { setValue(loadSettings()); } catch (e) { setError(e instanceof Error ? e.message : "Browser storage unavailable."); }
      setHydrated(true);
    };
    void bootstrap();
    fetch("/api/config", { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error("Server connection status unavailable.");
      setServer(await res.json());
    }).catch(() => { if (!controller.signal.aborted) setError("Server connection status unavailable."); });
    return () => controller.abort();
  }, []);
  function setSettings(next: AppSettings) {
    setValue(next);
    try { saveSettings(next); setError(null); } catch { setError("Settings work for this session, but browser storage could not be updated."); }
  }
  function forget() {
    setValue({ ...DEFAULT_SETTINGS });
    try { forgetSettings(); setError(null); } catch { setError("Session access forgotten, but saved browser credentials could not be removed. Clear site data in your browser."); }
  }
  return <SettingsContext.Provider value={{ settings, setSettings, updateSetting: (key, value) => setSettings({ ...settings, [key]: value }), forget, error, hydrated, server }}>{children}</SettingsContext.Provider>;
}
export function useSettings() { const value = useContext(SettingsContext); if (!value) throw new Error("Settings provider is required."); return value; }
export function requestHeaders(settings: AppSettings) {
  return { "Content-Type": "application/json", "x-deepseek-key": settings.deepseekApiKey, "x-openrouter-key": settings.openrouterApiKey, "x-typesafe-key": settings.typesafeApiKey, "x-app-access-token": settings.appAccessToken };
}
