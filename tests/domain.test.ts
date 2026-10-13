import { describe, expect, it } from "vitest";
import { validateDomain } from "@/lib/validation";
import { buildOptimizerMessages, parseOptimizationResponse, preservationWarnings } from "@/lib/optimizer-prompt";
import { runHeuristicDiagnostics, validateQualityAnswers } from "@/lib/jev";
import { composePresets } from "@/lib/presets";
import { PROFILES, migrateModel } from "@/lib/profiles";
import { migrateHistory, retainHistory, saveSettings, loadSettings } from "@/lib/storage";
import { DEFAULT_SETTINGS, type PromptHistoryItem } from "@/lib/types";

describe("runtime domain", () => {
  it.each([null, [], { prompt: 42 }, { prompt: "" }, { prompt: "a".repeat(20001) }, { prompt: "valid", kind: "bogus" }, { prompt: "valid", mode: "bogus" }, { prompt: "valid", engineTarget: "flux", kind: "video" }, { prompt: "valid", model: "deepseek-chat" }, { prompt: "valid", allowLocalFallback: "yes" }])("rejects invalid input %j", (body) => expect(() => validateDomain(body)).toThrow());
  it("defaults to minimal/local/current flash", () => expect(validateDomain({ prompt: "Translate hello into French." })).toMatchObject({ mode: "minimal", diagnosticSource: "local", model: "deepseek-flash" }));
});
describe("preservation and response boundaries", () => {
  it.each(["raw answer", "{\"optimized\":\"candidate\"}", JSON.stringify({ optimized: "", summary: "ok", changes: [], assumptions: [], questions: [] }), JSON.stringify({ optimized: "ok", summary: 4, changes: [], assumptions: [], questions: [] })])("never accepts raw or malformed output", (raw) => expect(() => parseOptimizationResponse(raw)).toThrow());
  it("accepts complete schema and rejects unsupported negatives", () => {
    const raw = JSON.stringify({ optimized: "Use [literal] exactly.", summary: "Kept literal.", changes: [], assumptions: [], questions: [] });
    expect(parseOptimizationResponse(raw).optimized).toContain("[literal]");
    expect(() => parseOptimizationResponse(raw.replace("\"changes\"", "\"negativePrompt\":\"bad\",\"changes\""), "flux")).toThrow();
  });
  it.each(["minimal", "structured", "creative"] as const)("makes %s preservation explicit without imposed timing/tags", (mode) => {
    const messages = buildOptimizerMessages("Static camera, 3 seconds, [literal] bird.", "video", undefined, "veo", mode);
    expect(messages.system).toContain("static-camera"); expect(messages.system).toContain("Never introduce bracket variables");
    expect(messages.user).toContain("3 seconds"); expect(messages.system).not.toContain("5-8s");
  });
  it("flags altered constraints, brackets and bloat", () => {
    expect(preservationWarnings("Static camera. 3 seconds. Never pan.", "Pan for 8 seconds [scene].", "minimal").length).toBeGreaterThan(2);
    expect(preservationWarnings("[literal] static camera 3 seconds", "[literal] static camera 3 seconds", "minimal")).toEqual([]);
  });
  it.each([{}, { intent_preserved: { noul: 0.9 } }, { intent_preserved: { noul: 2 }, over_engineered: { noul: 0.1 } }, { intent_preserved: { noul: Number.NaN }, over_engineered: { noul: 0.1 } }])("missing or invalid checks never pass", (value) => expect(() => validateQualityAnswers(value, "openrouter")).toThrow());
  it("failed checks explicitly need review", () => expect(validateQualityAnswers({ intent_preserved: { noul: 0.2 }, over_engineered: { noul: 0.8 } }, "typesafe")).toMatchObject({ state: "needsReview", passed: false }));
});
describe("type-aware rules and profiles", () => {
  it("short clear task scores well without persona", () => expect(runHeuristicDiagnostics("Translate hello into French.", "user")).toMatchObject({ clarityScore: 3, lacksRole: 0, issues: [] }));
  it("static camera and still subject are valid", () => expect(runHeuristicDiagnostics("A still bird, static camera, 3 seconds.", "video")).toMatchObject({ clarityScore: 3, lacksCameraMovement: 0.1, issues: [] }));
  it("explicit kind controls rubric", () => expect(runHeuristicDiagnostics("You are a portrait camera.", "image").issues).not.toContain("Define boundaries"));
  it("does not universalize negative fields", () => { expect(PROFILES.flux.negative).toBe(false); expect(PROFILES.kling.negative).toBe(false); expect(PROFILES.sd.negative).toBe(true); });
  it("replaces ratio/lens without duplicate punctuation", () => {
    const first = composePresets("Bird, aspect ratio 16:9, shot on 35mm lens", "midjourney", "9:16", "85mm");
    const second = composePresets(first, "midjourney", "1:1", "24mm");
    expect(second).toBe("Bird\nShot on 24mm lens\n--ar 1:1");
    expect(composePresets(second, "universal", "", "")).toBe("Bird");
    expect(composePresets("", "universal", "1:1", "")).toBe("Aspect ratio 1:1");
  });
});
describe("history and credentials", () => {
  it("migrates legacy history safely with no mixed metrics", () => {
    const items = migrateHistory([{ id: "1", createdAt: 1, original: "Hello world", optimized: "Hello, world", summary: "Fix", kind: "user", isFavorite: true }, { original: 4 }]);
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ mode: "minimal", model: "deepseek-flash", schemaVersion: 2, isFavorite: true, qualityGate: { passed: false } });
  });
  it("protects favorites from rolling eviction", () => {
    const favorite = { id: "favorite", isFavorite: true } as PromptHistoryItem;
    expect(retainHistory([...Array.from({ length: 40 }, (_, index) => ({ id: `${index}`, isFavorite: false } as PromptHistoryItem)), favorite])).toHaveLength(31);
  });
  it("never persists shared token and defaults keys to session memory", () => {
    localStorage.clear(); saveSettings({ ...DEFAULT_SETTINGS, appAccessToken: "owner-secret", deepseekApiKey: "byok-secret" });
    const raw = localStorage.getItem("prompt-optimizer-settings-v3")!;
    expect(raw).not.toContain("secret");
    saveSettings({ ...DEFAULT_SETTINGS, appAccessToken: "owner-secret", deepseekApiKey: "byok-secret", rememberKeys: true });
    expect(loadSettings().deepseekApiKey).toBe("byok-secret"); expect(loadSettings().appAccessToken).toBe("");
  });
  it("forgets legacy plaintext keys and migrates supported aliases", () => {
    localStorage.clear(); localStorage.setItem("prompt-optimizer-settings-v2", JSON.stringify({ deepseekApiKey: "legacy-secret", deepseekModel: "deepseek-chat" }));
    expect(loadSettings().deepseekApiKey).toBe(""); expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBeNull();
    expect(migrateModel("deepseek-chat")).toBe("deepseek-flash"); expect(migrateModel("deepseek-reasoner")).toBe("deepseek-v4-pro");
    localStorage.setItem("prompt-optimizer-settings-v2", JSON.stringify({ deepseekApiKey: "legacy-secret", deepseekModel: "deepseek-reasoner" }));
    expect(loadSettings().deepseekModel).toBe("deepseek-v4-pro");
  });
  it("restores historical mode/profile/checks/notes without arbitrary stored fields", () => {
    const [item] = migrateHistory([{ id: "full", createdAt: 1, original: "A bird", optimized: "A still bird", summary: "Kept bird", kind: "image", mode: "creative", engineTarget: "flux", model: "deepseek-v4-pro", profileVersion: "flux-2-test", changes: ["Edit"], assumptions: ["Still"], questions: ["Color?"], warnings: ["Check"], qualityGate: { state: "passed", source: "openrouter", passed: true, intentPreserved: 0.9, overEngineered: 0.1, reason: "Checked" }, deepseekApiKey: "not-allowed" }]);
    expect(item).toMatchObject({ mode: "creative", profileVersion: "flux-2-test", model: "deepseek-v4-pro", changes: ["Edit"], assumptions: ["Still"], qualityGate: { intentPreserved: 0.9, overEngineered: 0.1 } });
    expect(JSON.stringify(item)).not.toContain("not-allowed");
  });
});
