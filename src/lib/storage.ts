import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type PromptHistoryItem,
} from "./types";
import { migrateModel, PROFILES } from "./profiles";
import {
  enumValue,
  numberValue,
  record,
  text,
  validateDomain,
} from "./validation";

const SETTINGS_KEY = "prompt-optimizer-settings-v3";
const LEGACY_SETTINGS = "prompt-optimizer-settings-v2";
const HISTORY_KEY = "prompt-optimizer-history-v2";
const LEGACY_HISTORY = "prompt-optimizer-history-v1";
const PROVIDER_KEY_FIELDS = [
  "deepseekApiKey",
  "openrouterApiKey",
  "typesafeApiKey",
] as const;
export interface LegacySettingsInfo {
  detected: boolean;
  importable: boolean;
  malformed: boolean;
  invalidKeys: boolean;
}
export const NO_LEGACY_SETTINGS: LegacySettingsInfo = {
  detected: false,
  importable: false,
  malformed: false,
  invalidKeys: false,
};
function validLegacyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 512 &&
    Boolean(value.trim()) &&
    !/[\r\n]/.test(value)
  );
}
export function inspectLegacySettings(): LegacySettingsInfo {
  const raw = localStorage.getItem(LEGACY_SETTINGS);
  if (!raw) return { ...NO_LEGACY_SETTINGS };
  try {
    const value = record(JSON.parse(raw));
    const detected = PROVIDER_KEY_FIELDS.some((key) =>
      typeof value[key] === "string"
        ? Boolean(value[key].trim())
        : value[key] !== undefined && value[key] !== null,
    );
    const importable = PROVIDER_KEY_FIELDS.some((key) =>
      validLegacyKey(value[key]),
    );
    const invalidKeys = PROVIDER_KEY_FIELDS.some(
      (key) =>
        value[key] !== undefined &&
        value[key] !== null &&
        value[key] !== "" &&
        !validLegacyKey(value[key]) &&
        !(typeof value[key] === "string" && !value[key].trim()),
    );
    return { detected, importable, malformed: false, invalidKeys };
  } catch {
    return {
      detected: true,
      importable: false,
      malformed: true,
      invalidKeys: false,
    };
  }
}
export function importLegacySettings(): AppSettings {
  const raw = localStorage.getItem(LEGACY_SETTINGS);
  if (!raw) throw new Error("No legacy saved credentials are available.");
  let value: Record<string, unknown>;
  try {
    value = record(JSON.parse(raw));
  } catch {
    throw new Error(
      "Legacy saved settings could not be parsed. The saved data is unchanged and remains recoverable.",
    );
  }
  const imported = {
    ...DEFAULT_SETTINGS,
    deepseekModel: migrateModel(value.deepseekModel),
    autoDiagnose: false,
  };
  let count = 0;
  for (const key of PROVIDER_KEY_FIELDS) {
    const credential = value[key];
    if (validLegacyKey(credential)) {
      imported[key] = credential.trim();
      count++;
    }
  }
  if (!count)
    throw new Error(
      "No valid bounded provider keys could be imported. Legacy saved data is unchanged.",
    );
  return imported;
}
export function forgetLegacySettings() {
  localStorage.removeItem(LEGACY_SETTINGS);
}
export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  const raw = localStorage.getItem(SETTINGS_KEY);
  const legacy = localStorage.getItem(LEGACY_SETTINGS);
  // Import is session-only; the saved legacy copy is removed only by explicit Forget.
  if (!raw) {
    if (!legacy) return { ...DEFAULT_SETTINGS };
    try {
      return {
        ...DEFAULT_SETTINGS,
        deepseekModel: migrateModel(record(JSON.parse(legacy)).deepseekModel),
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  try {
    const value = record(JSON.parse(raw));
    const rememberKeys = value.rememberKeys === true;
    return {
      ...DEFAULT_SETTINGS,
      deepseekModel: migrateModel(value.deepseekModel),
      autoDiagnose: value.autoDiagnose !== false,
      diagnosticSource: enumValue(
        value.diagnosticSource,
        ["local", "openrouter", "typesafe"] as const,
        "local",
        "source",
      ),
      allowLocalFallback: value.allowLocalFallback === true,
      rememberKeys,
      deepseekApiKey: rememberKeys
        ? text(value.deepseekApiKey, "Key", false, 512)
        : "",
      openrouterApiKey: rememberKeys
        ? text(value.openrouterApiKey, "Key", false, 512)
        : "",
      typesafeApiKey: rememberKeys
        ? text(value.typesafeApiKey, "Key", false, 512)
        : "",
    };
  } catch {
    throw new Error(
      "Saved settings are invalid. Forget saved settings and reconfigure access.",
    );
  }
}
export function saveSettings(settings: AppSettings) {
  const {
    appAccessToken: _token,
    deepseekApiKey,
    openrouterApiKey,
    typesafeApiKey,
    ...safe
  } = settings;
  void _token;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...safe,
      ...(settings.rememberKeys
        ? { deepseekApiKey, openrouterApiKey, typesafeApiKey }
        : {}),
    }),
  );
}
export function forgetSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(LEGACY_SETTINGS);
}
export function migrateHistory(value: unknown): PromptHistoryItem[] {
  if (!Array.isArray(value)) throw new Error("Saved history is invalid.");
  return value.flatMap((entry): PromptHistoryItem[] => {
    try {
      const item = record(entry);
      const original = text(item.original, "Original");
      const domain = validateDomain({
        prompt: original,
        kind: item.kind,
        mode: item.mode,
        engineTarget: item.engineTarget,
        model: migrateModel(item.model),
      });
      const optimized = text(item.optimized, "Candidate");
      const summary = text(item.summary, "Summary", false, 2000);
      const arrays = (key: string) =>
        Array.isArray(item[key])
          ? (item[key] as unknown[])
              .filter(
                (v): v is string => typeof v === "string" && v.length <= 2000,
              )
              .slice(0, 20)
          : [];
      return [
        {
          schemaVersion: 2,
          id: text(item.id, "History ID", true, 200),
          createdAt:
            typeof item.createdAt === "number" &&
            Number.isFinite(item.createdAt)
              ? item.createdAt
              : 0,
          original,
          prompt: original,
          optimized,
          summary,
          kind: domain.kind,
          mode: domain.mode,
          engineTarget: domain.engineTarget,
          model: domain.model,
          profileVersion:
            typeof item.profileVersion === "string"
              ? item.profileVersion
              : PROFILES[domain.engineTarget].version,
          isFavorite: item.isFavorite === true,
          changes: arrays("changes"),
          assumptions: arrays("assumptions"),
          questions: arrays("questions"),
          warnings: arrays("warnings"),
          ...(typeof item.negativePrompt === "string" &&
          PROFILES[domain.engineTarget].negative
            ? { negativePrompt: item.negativePrompt.slice(0, 2000) }
            : {}),
          qualityGate: historicalQuality(item.qualityGate),
          ...(item.diagnostics
            ? {
                diagnostics: historicalDiagnostics(
                  item.diagnostics,
                  domain.kind,
                ),
              }
            : {}),
          ...(item.completion
            ? { completion: historicalCompletion(item.completion) }
            : {}),
        },
      ];
    } catch {
      return [];
    }
  });
}
function historicalQuality(value: unknown): PromptHistoryItem["qualityGate"] {
  const fallback: PromptHistoryItem["qualityGate"] = {
    state: "unavailable",
    passed: false,
    source: "local",
    reason: "Legacy history has no verification record.",
  };
  if (!value) return fallback;
  try {
    const gate = record(value);
    const state = enumValue(
      gate.state,
      ["passed", "needsReview", "unavailable"] as const,
      "unavailable",
      "Gate state",
    );
    const source = enumValue(
      gate.source,
      ["local", "openrouter", "typesafe"] as const,
      "local",
      "Gate source",
    );
    const intentPreserved =
      gate.intentPreserved === undefined
        ? undefined
        : numberValue(gate.intentPreserved, 0, 1, "Intent preservation");
    const overEngineered =
      gate.overEngineered === undefined
        ? undefined
        : numberValue(gate.overEngineered, 0, 1, "Bloat");
    const passed =
      state === "passed" &&
      intentPreserved !== undefined &&
      overEngineered !== undefined &&
      intentPreserved >= 0.7 &&
      overEngineered <= 0.6;
    return {
      state: state === "passed" && !passed ? "unavailable" : state,
      passed,
      source,
      intentPreserved,
      overEngineered,
      reason:
        text(gate.reason, "Gate reason", false, 2000) ||
        "Historical evaluation. Re-evaluate before use.",
    };
  } catch {
    return fallback;
  }
}
function historicalDiagnostics(
  value: unknown,
  kind: PromptHistoryItem["kind"],
): PromptHistoryItem["diagnostics"] {
  try {
    const data = record(value);
    const list = (value: unknown) =>
      Array.isArray(value)
        ? value
            .filter(
              (v): v is string => typeof v === "string" && v.length <= 2000,
            )
            .slice(0, 20)
        : [];
    return {
      source: enumValue(
        data.source,
        ["local", "openrouter", "typesafe"] as const,
        "local",
        "Source",
      ),
      clarityScore: numberValue(data.clarityScore, 0, 3, "Clarity"),
      clarityLabel: text(data.clarityLabel, "Label", true, 100),
      isAmbiguous: numberValue(data.isAmbiguous, 0, 1, "Ambiguity"),
      lacksConstraints: numberValue(data.lacksConstraints, 0, 1, "Constraints"),
      lacksRole: numberValue(data.lacksRole, 0, 1, "Context"),
      injectionRisk: numberValue(data.injectionRisk, 0, 1, "Injection"),
      issues: list(data.issues),
      strengths: list(data.strengths),
      findings: Array.isArray(data.findings)
        ? data.findings.slice(0, 3).map((value) => {
            const finding = record(value);
            return {
              title: text(finding.title, "Finding", true, 200),
              why: text(finding.why, "Reason", true, 2000),
              question: text(finding.question, "Question", true, 2000),
            };
          })
        : [],
      suggestedKind: kind,
      ...(typeof data.fallback === "string"
        ? { fallback: text(data.fallback, "Fallback", false, 2000) }
        : {}),
      ...(data.lacksTemporalAction !== undefined
        ? {
            lacksTemporalAction: numberValue(
              data.lacksTemporalAction,
              0,
              1,
              "Action",
            ),
          }
        : {}),
      ...(data.lacksCameraMovement !== undefined
        ? {
            lacksCameraMovement: numberValue(
              data.lacksCameraMovement,
              0,
              1,
              "Camera",
            ),
          }
        : {}),
    };
  } catch {
    return undefined;
  }
}
function historicalCompletion(value: unknown): PromptHistoryItem["completion"] {
  try {
    const result = record(value);
    const model = text(result.model, "Model", true, 200);
    const elapsedMs = numberValue(result.elapsedMs, 0, 3600000, "Elapsed time");
    if (!result.usage) return { model, elapsedMs };
    const usage = record(result.usage);
    return {
      model,
      elapsedMs,
      usage: {
        prompt_tokens: numberValue(
          usage.prompt_tokens,
          0,
          10000000,
          "Input tokens",
        ),
        completion_tokens: numberValue(
          usage.completion_tokens,
          0,
          10000000,
          "Output tokens",
        ),
        total_tokens: numberValue(
          usage.total_tokens,
          0,
          20000000,
          "Total tokens",
        ),
      },
    };
  } catch {
    return undefined;
  }
}
export function loadHistory() {
  if (typeof window === "undefined") return [];
  const raw =
    localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY);
  if (!raw) return [];
  try {
    return migrateHistory(JSON.parse(raw));
  } catch {
    throw new Error(
      "Saved history could not be read. Clear history to recover.",
    );
  }
}
export function retainHistory(items: PromptHistoryItem[]) {
  let recent = 0;
  return items.filter((item) => item.isFavorite || recent++ < 30);
}
function writeHistory(items: PromptHistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(retainHistory(items)));
  localStorage.removeItem(LEGACY_HISTORY);
}
export function saveHistoryItem(
  item: Omit<
    PromptHistoryItem,
    "id" | "createdAt" | "isFavorite" | "schemaVersion"
  >,
): PromptHistoryItem {
  const next: PromptHistoryItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    isFavorite: false,
    schemaVersion: 2,
  };
  writeHistory([next, ...loadHistory()]);
  return next;
}
export function toggleFavoriteHistoryItem(id: string) {
  const items = loadHistory().map((item) =>
    item.id === id ? { ...item, isFavorite: !item.isFavorite } : item,
  );
  writeHistory(items);
  return items;
}
export function deleteHistoryItem(id: string) {
  const items = loadHistory().filter((item) => item.id !== id);
  writeHistory(items);
  return items;
}
export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(LEGACY_HISTORY);
}
