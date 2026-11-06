"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSettings, requestHeaders } from "@/lib/settings-context";
import {
  DEFAULT_SETTINGS,
  MODELS,
  type AppSettings,
  type DecisionBackendName,
  type ServerConfig,
} from "@/lib/types";
import { MODEL_SOURCE } from "@/lib/profiles";
import { Dialog } from "./dialog";

interface SettingsContentProps {
  className?: string;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function useSettingsForm({
  onClose,
  onDirtyChange,
}: SettingsContentProps = {}) {
  const {
    settings,
    setSettings,
    forget,
    error,
    server,
    legacy,
    importLegacy,
    forgetLegacy,
  } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState("");
  const [tested, setTested] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const keyInput = useRef<HTMLInputElement | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const dirtyRef = useRef(onDirtyChange);

  useEffect(() => {
    dirtyRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    // The first useful control, not the Close button, takes focus.
    const timer = window.setTimeout(() => keyInput.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    dirtyRef.current?.(dirty);
  }, [dirty]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    controller.current?.abort();
    setBusy(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
    setTested({});
    setStatus("");
  }
  function save() {
    setSettings(draft);
    const remembered = [
      draft.rememberKeys && "provider keys",
      draft.rememberToken && "owner token",
    ].filter(Boolean);
    setStatus(
      remembered.length
        ? `Saved. Remembered as plaintext in this browser: ${remembered.join(" and ")}.`
        : "Saved for this session. Provider keys and the shared token are not persisted.",
    );
  }
  function cancel() {
    controller.current?.abort();
    setBusy(false);
    setDraft(settings);
    setTested({});
    setStatus("");
    onClose?.();
  }
  function handleImportLegacy() {
    controller.current?.abort();
    setBusy(false);
    const imported = importLegacy();
    if (!imported) return;
    setDraft(imported);
    setTested({});
    setStatus(
      "Saved provider keys imported for this session only. No provider request was sent; automatic diagnosis is paused. Legacy saved data is unchanged.",
    );
  }
  function handleForgetLegacy() {
    if (forgetLegacy()) {
      setStatus(
        "Legacy saved copy removed. Current session credentials are unchanged.",
      );
    }
  }
  function forgetAll() {
    controller.current?.abort();
    setBusy(false);
    forget();
    setDraft({ ...DEFAULT_SETTINGS });
    setTested({});
    setStatus("Credentials forgotten. Shared access disconnected.");
  }
  async function test(provider: "deepseek" | "openrouter") {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setStatus(
      "Testing sends a small request to the selected provider and may incur charges.",
    );
    try {
      const response = await fetch(
        provider === "deepseek" ? "/api/test-run" : "/api/diagnose",
        {
          method: "POST",
          headers: requestHeaders(draft),
          signal: current.signal,
          body: JSON.stringify({
            prompt: "Return the word connected.",
            kind: "user",
            model: draft.deepseekModel,
            diagnosticSource: provider === "deepseek" ? "local" : provider,
            allowLocalFallback: false,
            maxTokens: 64,
          }),
        },
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "Connection test failed.");
      if (current.signal.aborted) return;
      setTested((prev) => ({ ...prev, [provider]: "Tested successfully" }));
      setStatus(
        `${provider}: tested successfully. This does not measure rewrite quality.`,
      );
    } catch (e) {
      if (!current.signal.aborted) {
        setTested((prev) => ({ ...prev, [provider]: "Unavailable" }));
        setStatus(e instanceof Error ? e.message : "Connection unavailable.");
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  function field(
    key: "deepseekApiKey" | "openrouterApiKey",
    label: string,
    provider: "deepseek" | "openrouter",
  ) {
    const access = draft[key]
      ? tested[provider] || "Key added, not tested"
      : server?.[provider] && draft.appAccessToken
        ? "Shared access supplied, not tested"
        : server?.[provider]
          ? "The server has shared access. Add the owner token below, or use your own key."
          : "No key yet.";
    return (
      <div className="settings-field">
        <label htmlFor={key}>{label}</label>
        <input
          ref={key === "deepseekApiKey" ? keyInput : undefined}
          id={key}
          type="password"
          autoComplete="off"
          value={draft[key]}
          onChange={(e) => update(key, e.target.value)}
        />
        <div className="settings-field-foot">
          <span className="help">{access}</span>
          <button type="button" disabled={busy} onClick={() => test(provider)}>
            Test {provider}
          </button>
        </div>
      </div>
    );
  }
  return {
    draft,
    status,
    error,
    server,
    legacy,
    busy,
    keyInput,
    update,
    save,
    cancel,
    handleImportLegacy,
    handleForgetLegacy,
    forgetAll,
    field,
    onClose,
  };
}
type SettingsForm = ReturnType<typeof useSettingsForm>;

const JUDGE_LABEL: Record<DecisionBackendName, string> = {
  typesafe: "TypeSafe Jev",
  mouse: "Mouse-1",
  decision1: "Microsoft Decision-1",
};

/** What will judge the next run, before the user spends a rewrite. */
function JudgeStatus({
  server,
  draft,
}: {
  server: ServerConfig | null;
  draft: AppSettings;
}) {
  const decisions = server?.decisions;
  const order = decisions?.order ?? [];
  const configured = decisions
    ? order.filter((name) => decisions[name])
    : [];
  const parts: string[] = [];
  if (server === null) {
    parts.push("Server status unavailable.");
  } else if (configured.length) {
    parts.push(
      `Server, with a valid owner token: ${configured
        .map((name) => JUDGE_LABEL[name])
        .join(" -> ")}`,
    );
  } else {
    parts.push("No server judge key is configured.");
  }
  if (draft.openrouterApiKey.trim()) {
    parts.push("Your OpenRouter key: Microsoft Decision-1");
  }
  if (!configured.length && !draft.openrouterApiKey.trim()) {
    parts.push(
      "With neither, the draft read is rule-based and rewrites are not independently checked.",
    );
  }
  return (
    <p className="help">
      Judge before a run: {parts.join(". ")}. The first configured backend that
      answers is used, so a missing one falls through instead of failing the run.
    </p>
  );
}

function SettingsFields({ form }: { form: SettingsForm }) {
  const {
    draft,
    update,
    field,
    server,
    legacy,
    handleImportLegacy,
    handleForgetLegacy,
    forgetAll,
  } = form;
  return (
    <div className="settings-fields">
      <p className="help settings-intro">
        Paste a DeepSeek or OpenRouter key to run the optimizer. Keys stay in
        this tab unless you choose to remember them. Requests go through this
        app&apos;s server to the provider you choose.
      </p>

      <section className="settings-section" aria-label="Provider keys">
        {field("deepseekApiKey", "DeepSeek API key", "deepseek")}
        <p className="help">
          Used for the rewrite. An OpenRouter key can do it instead.
        </p>
        {field("openrouterApiKey", "OpenRouter API key", "openrouter")}
        <p className="help">
          Adds Decision-1 checks when no server decisions key is active: intent
          kept, bloat, and whether the rewrite is better. The server tries
          TypeSafe, then Mouse-1, then Decision-1. With none of them, the draft
          read is rule-based and rewrites are not independently checked.
        </p>
      </section>

      <section className="settings-section" aria-label="Judge models">
        <h3>Judge models</h3>
        <JudgeStatus server={server} draft={draft} />
        <p className="help">
          The server order is set by DECISION_ORDER. Default: TypeSafe Jev,
          Mouse-1, Microsoft Decision-1.
        </p>
      </section>

      <section className="settings-section" aria-label="Rewrite model">
        <label htmlFor="model">Rewrite model</label>
        <select
          id="model"
          value={draft.deepseekModel}
          onChange={(e) =>
            update(
              "deepseekModel",
              e.target.value as AppSettings["deepseekModel"],
            )
          }
        >
          {MODELS.map((model) => (
            <option key={model}>{model}</option>
          ))}
        </select>
        <p className="help">
          Nonthinking mode is explicitly enabled for reproducible temperature
          settings.{" "}
          <a href={MODEL_SOURCE} target="_blank" rel="noreferrer">
            Model contract
          </a>{" "}
          reviewed 2026-10-14.
        </p>
      </section>

      <details className="settings-disclosure">
        <summary>Reading and storage options</summary>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.autoDiagnose}
            onChange={(e) => update("autoDiagnose", e.target.checked)}
          />
          Read my draft automatically as I type
        </label>
        <p className="help settings-check-help">
          Automatic reads run after you stop typing. With an OpenRouter key,
          each read is a model call.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.rememberKeys}
            onChange={(e) => update("rememberKeys", e.target.checked)}
          />
          Remember provider keys in this browser (plaintext)
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.rememberToken}
            onChange={(e) => update("rememberToken", e.target.checked)}
          />
          Remember owner token in this browser (plaintext)
        </label>
        <div className="action-row">
          <button type="button" onClick={forgetAll}>
            Forget all credentials
          </button>
        </div>
      </details>

      <details className="settings-disclosure">
        <summary>Shared access (owner)</summary>
        <label htmlFor="owner-token">Protected shared owner token</label>
        <input
          id="owner-token"
          type="password"
          autoComplete="off"
          value={draft.appAccessToken}
          onChange={(e) => update("appAccessToken", e.target.value)}
        />
        <p className="help">
          {server === null
            ? "Server status unavailable."
            : server.sharedAccess
              ? "Shared access is protected by the owner's token. Supplying a token is not proof that it is valid; test access."
              : "Shared access disabled. Use your own key; server keys cannot be used anonymously."}
        </p>
      </details>

      <details className="settings-disclosure">
        <summary>How your data is handled</summary>
        <p className="help">
          Diagnosis sends your draft to this app&apos;s server. With an owner
          token it may go to TypeSafe, Mouse-1, or Decision-1; with an OpenRouter
          key it goes to Decision-1. With no decisions key it stays on this server as a
          rule-based estimate, with no AI-provider transmission. Rewrites and
          text evaluations send prompts and credentials through this app&apos;s
          server to DeepSeek.
        </p>
        <p className="help">
          Remembered provider keys and a remembered owner token are plaintext
          and accessible to scripts on this origin. Legacy saved credentials
          stay untouched until you explicitly forget them; importing is
          session-only. Old model aliases migrate to Flash and Pro.
        </p>
      </details>

      {legacy.detected && (
        <section
          className="settings-section"
          aria-label="Legacy saved credentials"
        >
          <h3>Legacy saved credentials detected</h3>
          <p className="help">
            {legacy.malformed
              ? "Legacy saved settings could not be parsed. They remain unchanged and recoverable; nothing has been imported."
              : "The previous saved copy is unchanged. Import only valid provider keys into this session without sending a provider request or remembering them again. Automatic diagnosis is paused on import. Shared access is not imported."}
          </p>
          {legacy.invalidKeys && (
            <p className="help">
              Some saved key fields are invalid or exceed the limit. Only valid
              bounded keys can be imported; the saved copy will not be changed.
            </p>
          )}
          <div className="action-row">
            <button
              type="button"
              disabled={!legacy.importable}
              onClick={handleImportLegacy}
            >
              Import saved credentials for this session
            </button>
            <button type="button" onClick={handleForgetLegacy}>
              Forget legacy credentials
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsFooter({ form }: { form: SettingsForm }) {
  const { error, status, save, cancel, onClose } = form;
  return (
    <div className="settings-footer">
      <div className="settings-footer-actions">
        <button type="button" className="primary" onClick={save}>
          Save settings
        </button>
        {onClose && (
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      <p role="status" className="feedback settings-status">
        {error || status}
      </p>
    </div>
  );
}

export function SettingsContent({
  className,
  onClose,
  onDirtyChange,
}: SettingsContentProps) {
  const form = useSettingsForm({ onClose, onDirtyChange });
  return (
    <div className={className ? `settings-content ${className}` : "settings-content"}>
      <SettingsFields form={form} />
      <SettingsFooter form={form} />
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dirty = useRef(false);
  const form = useSettingsForm({
    onClose,
    onDirtyChange: (value) => {
      dirty.current = value;
    },
  });
  return (
    <Dialog
      title="Settings"
      onClose={onClose}
      beforeClose={() => {
        if (!dirty.current) return true;
        return window.confirm("Discard unsaved settings?");
      }}
      footer={<SettingsFooter form={form} />}
    >
      <SettingsFields form={form} />
    </Dialog>
  );
}

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return open ? <SettingsDialog onClose={onClose} /> : null;
}

export function SettingsPageView() {
  return (
    <main className="settings-page">
      <Link href="/">Back to workbench</Link>
      <h1>Settings</h1>
      <SettingsContent />
    </main>
  );
}
