"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSettings, requestHeaders } from "@/lib/settings-context";
import { DEFAULT_SETTINGS, MODELS, type AppSettings, type DiagnosticSource } from "@/lib/types";
import { MODEL_SOURCE } from "@/lib/profiles";
import { Dialog } from "./dialog";

export function SettingsContent({ className }: { className?: string }) {
  const { settings, setSettings, forget, error, server } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState("");
  const [tested, setTested] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    controller.current?.abort(); setBusy(false); setDraft((prev) => ({ ...prev, [key]: value })); setTested({}); setStatus("");
  }
  function save() { setSettings(draft); setStatus(draft.rememberKeys ? "Saved. Provider keys are remembered as plaintext in this browser; shared token is session-only." : "Saved for this session. Provider keys and shared token are not persisted."); }
  async function test(provider: "deepseek" | "openrouter" | "typesafe") {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setStatus("Testing sends a small request to the selected provider and may incur charges.");
    try {
      const response = await fetch(provider === "deepseek" ? "/api/test-run" : "/api/diagnose", {
        method: "POST", headers: requestHeaders(draft), signal: current.signal,
        body: JSON.stringify({ prompt: "Return the word connected.", kind: "user", model: draft.deepseekModel, diagnosticSource: provider === "deepseek" ? "local" : provider, allowLocalFallback: false, maxTokens: 64 }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Connection test failed.");
      if (current.signal.aborted) return;
      setTested((prev) => ({ ...prev, [provider]: "Tested successfully" })); setStatus(`${provider}: tested successfully. This does not measure rewrite quality.`);
    } catch (e) { if (!current.signal.aborted) { setTested((prev) => ({ ...prev, [provider]: "Unavailable" })); setStatus(e instanceof Error ? e.message : "Connection unavailable."); } }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  function field(key: "deepseekApiKey" | "openrouterApiKey" | "typesafeApiKey", label: string, provider: "deepseek" | "openrouter" | "typesafe") {
    const access = draft[key] ? "BYOK configured (not yet tested)" : server?.[provider] && draft.appAccessToken ? "Protected shared access supplied (not yet tested)" : server?.[provider] ? "Protected shared access requires owner token" : "Unavailable until a BYOK key is supplied";
    return <section className="settings-section"><label htmlFor={key}>{label}</label><input id={key} type="password" autoComplete="off" value={draft[key]} onChange={(e) => update(key, e.target.value)} />
      <div className="action-row"><span>{tested[provider] || access}</span><button type="button" disabled={busy} onClick={() => test(provider)}>Test {provider}</button></div></section>;
  }
  return <div className={className}>
    <p className="help">Default diagnosis stays local. Rewrites and text evaluations send prompts and credentials through this app&apos;s server to DeepSeek. External diagnostics send prompt data only to your explicitly selected provider. Use HTTPS in production.</p>
    <p className="help">Keys stay in session memory unless you explicitly remember them. Remembered keys are plaintext and accessible to scripts on this origin. Legacy saved keys are forgotten; old model aliases migrate to Flash/Pro. The shared owner token is never remembered.</p>
    {(error || status) && <p role="status" className="feedback">{error || status}</p>}
    {field("deepseekApiKey", "DeepSeek API key", "deepseek")}
    <label htmlFor="model">Rewrite and evaluation model</label><select id="model" value={draft.deepseekModel} onChange={(e) => update("deepseekModel", e.target.value as AppSettings["deepseekModel"])}>{MODELS.map((model) => <option key={model}>{model}</option>)}</select>
    <p className="help">Nonthinking mode is explicitly enabled for reproducible temperature settings. <a href={MODEL_SOURCE} target="_blank" rel="noreferrer">Model contract</a> reviewed 2026-10-14.</p>
    <section className="settings-section"><label htmlFor="owner-token">Protected shared owner token (session only)</label><input id="owner-token" type="password" autoComplete="off" value={draft.appAccessToken} onChange={(e) => update("appAccessToken", e.target.value)} /><p className="help">{server === null ? "Server status unavailable." : server.sharedAccess ? "Shared access is protected by the owner's token. Supplying a token is not proof that it is valid; test access." : "Shared access disabled. Use BYOK; server keys cannot be used anonymously."}</p></section>
    <details><summary>Advanced diagnostics and privacy</summary>
      <label htmlFor="source">Diagnostic provider (explicit data-sharing choice)</label><select id="source" value={draft.diagnosticSource} onChange={(e) => update("diagnosticSource", e.target.value as DiagnosticSource)}><option value="local">Local heuristic, no external transmission</option><option value="openrouter">OpenRouter Decision-1</option><option value="typesafe">TypeSafe System One</option></select>
      {field("openrouterApiKey", "OpenRouter API key", "openrouter")}{field("typesafeApiKey", "TypeSafe API key", "typesafe")}
      <label className="check-row"><input type="checkbox" checked={draft.allowLocalFallback} onChange={(e) => update("allowLocalFallback", e.target.checked)} />Allow local fallback if selected external diagnostics fail (no other external provider)</label>
      <label className="check-row"><input type="checkbox" checked={draft.autoDiagnose} onChange={(e) => update("autoDiagnose", e.target.checked)} />Automatically diagnose drafts using my selected source</label>
    </details>
    <label className="check-row"><input type="checkbox" checked={draft.rememberKeys} onChange={(e) => update("rememberKeys", e.target.checked)} />Remember provider keys in this browser (plaintext)</label>
    <div className="action-row"><button type="button" className="primary" onClick={save}>Save settings</button><button type="button" onClick={() => { controller.current?.abort(); setBusy(false); forget(); setDraft({ ...DEFAULT_SETTINGS }); setTested({}); setStatus("Credentials forgotten. Shared access disconnected."); }}>Forget all credentials</button></div>
  </div>;
}
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) { return open ? <Dialog title="Settings" onClose={onClose}><SettingsContent /></Dialog> : null; }
export function SettingsPageView() { return <main className="settings-page"><Link href="/">Back to workbench</Link><h1>Settings</h1><SettingsContent /></main>; }
