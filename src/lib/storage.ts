import {
  DEFAULT_SETTINGS,
  normalizeEngineTarget,
  type AppSettings,
  type PromptHistoryItem,
} from "./types";
import { migrateModel, PROFILES } from "./profiles";
import {
  numberValue,
  record,
  text,
  validateDomain,
} from "./validation";

const SETTINGS_KEY = "prompt-optimizer-settings-v3";
const LEGACY_SETTINGS = "prompt-optimizer-settings-v2";
const HISTORY_KEY = "prompt-optimizer-history-v2";
const LEGACY_HISTORY = "prompt-optimizer-history-v1";
const PROVIDER_KEY_FIELDS = ["deepseekApiKey", "openrouterApiKey"] as const;
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
    const rememberToken = value.rememberToken === true;
    return {
      ...DEFAULT_SETTINGS,
      deepseekModel: migrateModel(value.deepseekModel),
      autoDiagnose: value.autoDiagnose !== false,
      rememberKeys,
      deepseekApiKey: rememberKeys
        ? text(value.deepseekApiKey, "Key", false, 512)
        : "",
      openrouterApiKey: rememberKeys
        ? text(value.openrouterApiKey, "Key", false, 512)
        : "",
      rememberToken,
      appAccessToken: rememberToken
        ? text(value.appAccessToken, "Token", false, 512)
        : "",
    };
  } catch {
    throw new Error(
      "Saved settings are invalid. Forget saved settings and reconfigure access.",
    );
  }
}
export function saveSettings(settings: AppSettings) {
  const { appAccessToken, deepseekApiKey, openrouterApiKey, ...safe } = settings;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...safe,
      ...(settings.rememberKeys
        ? { deepseekApiKey, openrouterApiKey }
        : {}),
      ...(settings.rememberToken ? { appAccessToken } : {}),
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
        // Items saved with a retired target (midjourney, flux, ...) keep their history as general.
        engineTarget: normalizeEngineTarget(item.engineTarget),
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
          schemaVersion: 3,
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
          unresolvedQuestions: arrays("unresolvedQuestions").length
            ? arrays("unresolvedQuestions")
            : arrays("questions"),
          warnings: arrays("warnings"),
          ...(typeof item.negativePrompt === "string" &&
          PROFILES[domain.engineTarget].negative
            ? { negativePrompt: item.negativePrompt.slice(0, 2000) }
            : {}),
          ...(historicalQuality(item.qualityGate)
            ? { qualityGate: historicalQuality(item.qualityGate) }
            : {}),
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
  if (!value) return undefined;
  try {
    const gate = record(value);
    const intentPreserved = numberValue(gate.intentPreserved, 0, 1, "Intent preservation");
    const overEngineered = numberValue(gate.overEngineered, 0, 1, "Bloat");
    return {
      intentPreserved,
      overEngineered,
      ...(gate.improvement !== undefined
        ? { improvement: numberValue(gate.improvement, 0, 1, "Improvement") }
        : {}),
      // Recomputed from the scores rather than trusted from storage.
      passed: intentPreserved >= 0.7 && overEngineered <= 0.4,
      ...(typeof gate.judge === "string"
        ? { judge: text(gate.judge, "Judge", false, 200) }
        : {}),
    };
  } catch {
    return undefined;
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
      clarityScore: numberValue(data.clarityScore, 0, 3, "Clarity"),
      clarityLabel: text(data.clarityLabel, "Label", true, 100),
      isAmbiguous: numberValue(data.isAmbiguous, 0, 1, "Ambiguity"),
      lacksConstraints: numberValue(data.lacksConstraints, 0, 1, "Constraints"),
      lacksRole: numberValue(data.lacksRole, 0, 1, "Context"),
      injectionRisk: numberValue(data.injectionRisk, 0, 1, "Injection"),
      issues: list(data.issues),
      strengths: list(data.strengths),
      unresolvedQuestions: list(data.unresolvedQuestions),
      ...(typeof data.engine === "string"
        ? { engine: text(data.engine, "Engine", false, 200) }
        : {}),
      ...(data.heuristic === true ? { heuristic: true } : {}),
      suggestedKind: kind,
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
    schemaVersion: 3,
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
