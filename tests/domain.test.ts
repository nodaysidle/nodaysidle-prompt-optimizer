import { describe, expect, it, vi } from "vitest";
import { validateDomain } from "@/lib/validation";
import {
  buildOptimizerMessages,
  findFabricatedPlaceholders,
  parseOptimizationResponse,
  preservationWarnings,
} from "@/lib/optimizer-prompt";
import { mapDiagnosticAnswers, runHeuristicDiagnostics } from "@/lib/decisions";
import {
  addReferencePhotoInstruction,
  composePresets,
  parsePresets,
} from "@/lib/presets";
import { PROFILES, migrateModel } from "@/lib/profiles";
import {
  forgetLegacySettings,
  forgetSettings,
  importLegacySettings,
  inspectLegacySettings,
  migrateHistory,
  retainHistory,
  saveSettings,
  loadSettings,
} from "@/lib/storage";
import { DEFAULT_SETTINGS, type PromptHistoryItem } from "@/lib/types";

describe("runtime domain", () => {
  it.each([
    null,
    [],
    { prompt: 42 },
    { prompt: "" },
    { prompt: "a".repeat(20001) },
    { prompt: "valid", kind: "bogus" },
    { prompt: "valid", mode: "bogus" },
    { prompt: "valid", engineTarget: "flux", kind: "video" },
    { prompt: "valid", engineTarget: "veo", kind: "image" },
    { prompt: "valid", engineTarget: "nano-banana", kind: "video" },
  ])("rejects invalid input %j", (body) =>
    expect(() => validateDomain(body)).toThrow(),
  );
  it("defaults to minimal/universal/current flash", () => {
    const domain = validateDomain({ prompt: "Translate hello into French." });
    expect(domain).toMatchObject({
      kind: "user",
      mode: "minimal",
      engineTarget: "universal",
      model: "deepseek-v4.1-flash",
    });
    expect(domain).not.toHaveProperty("diagnosticSource");
    expect(domain).not.toHaveProperty("allowLocalFallback");
  });
  it("upgrades retired model ids instead of rejecting or forwarding them", () => {
    for (const model of ["deepseek-chat", "deepseek-flash", "unknown", 4])
      expect(validateDomain({ prompt: "valid", model }).model).toBe(
        "deepseek-v4.1-flash",
      );
    for (const model of ["deepseek-reasoner", "deepseek/deepseek-v4-pro"])
      expect(validateDomain({ prompt: "valid", model }).model).toBe(
        "deepseek-v4-pro",
      );
  });
});
describe("preservation and response boundaries", () => {
  it.each([
    "raw answer",
    "Here is a better prompt: Translate hello into French.",
    '{"summary":"no candidate"}',
    JSON.stringify({ optimized: "", summary: "ok", changes: [] }),
    JSON.stringify({ optimized: 4, summary: "ok", changes: [] }),
  ])("never accepts raw or malformed output as a candidate", (raw) =>
    expect(() => parseOptimizationResponse(raw)).toThrow("required format"),
  );
  it("accepts a complete response and drops unsupported negatives", () => {
    const raw = JSON.stringify({
      optimized: "Use [literal] exactly.",
      summary: "Kept literal.",
      changes: [],
      assumptions: [],
      questions: ["Which audience?"],
    });
    const parsed = parseOptimizationResponse(raw);
    expect(parsed.optimized).toContain("[literal]");
    expect(parsed.questions).toEqual(["Which audience?"]);
    const withNegative = raw.replace(
      '"changes"',
      '"negativePrompt":"bad","changes"',
    );
    expect(
      parseOptimizationResponse(withNegative, "video", "A bird", "veo")
        .negativePrompt,
    ).toBeUndefined();
    expect(
      parseOptimizationResponse(withNegative, "user").negativePrompt,
    ).toBeUndefined();
  });
  it.each(["minimal", "structured", "creative"] as const)(
    "makes %s preservation explicit without imposed timing",
    (mode) => {
      const messages = buildOptimizerMessages(
        "Static camera, 3 seconds, [literal] bird.",
        "video",
        undefined,
        "veo",
        mode,
      );
      expect(messages.system).toContain(`MODE ${mode}`);
      expect(messages.system).toContain("NO FABRICATED FACTS");
      expect(messages.system).toContain("A static camera is valid");
      expect(messages.system).toContain("Never impose a duration");
      expect(messages.user).toContain("3 seconds");
      expect(messages.user).toContain("<ORIGINAL_PROMPT>");
      expect(messages.system).not.toContain("5-8s");
    },
  );
  it("flags altered constraints, brackets and bloat", () => {
    expect(
      preservationWarnings(
        "Static camera. 3 seconds. Never pan.",
        "Pan for 8 seconds [scene].",
        "minimal",
      ).length,
    ).toBeGreaterThan(2);
    expect(
      preservationWarnings(
        "[literal] static camera 3 seconds",
        "[literal] static camera 3 seconds",
        "minimal",
      ),
    ).toEqual([]);
  });
  it("flags generated bracket placeholders but not the user's own brackets", () => {
    expect(
      findFabricatedPlaceholders("Translate hello", "Translate [missing context]"),
    ).toEqual(["[missing context]"]);
    expect(
      findFabricatedPlaceholders("Use [literal] exactly", "Use [literal] exactly."),
    ).toEqual([]);
  });
  it("answers outside the valid range never become favorable scores", () => {
    const result = mapDiagnosticAnswers(
      {
        clarity: { score: 99 },
        is_ambiguous: { noul: -1 },
        lacks_constraints: { noul: 7 },
        injection_risk: { noul: Number.NaN },
      },
      { kind: "user", engine: "test" },
    );
    expect(result.clarityScore).toBe(1);
    expect(result.isAmbiguous).toBe(0.5);
    expect(result.lacksConstraints).toBe(0.5);
    expect(result.strengths).toEqual([]);
  });
});
describe("type-aware rules and profiles", () => {
  it("rule-based diagnostics are labelled heuristic, never calibrated", () => {
    const result = runHeuristicDiagnostics("Translate hello into French.", "user");
    expect(result.heuristic).toBe(true);
    expect(result.engine).toContain("heuristic");
  });
  it("a short user task is never penalised for lacking a persona", () => {
    const result = runHeuristicDiagnostics("Translate hello into French.", "user");
    expect(result.issues.join(" ")).not.toMatch(/persona|role/i);
  });
  it("persona is only requested for governing system prompts", () => {
    const long =
      "Answer questions about our refund policy for customers who write in about orders.";
    expect(runHeuristicDiagnostics(long, "system").issues.join(" ")).toMatch(
      /persona/i,
    );
    for (const kind of ["user", "image", "video"] as const)
      expect(runHeuristicDiagnostics(long, kind).issues.join(" ")).not.toMatch(
        /persona/i,
      );
  });
  it("static camera and still subject are valid", () => {
    const result = runHeuristicDiagnostics(
      "A still bird, static camera, 3 seconds.",
      "video",
    );
    expect(result.lacksCameraMovement).toBeLessThan(0.3);
    expect(result.lacksTemporalAction).toBeLessThan(0.3);
    expect(result.issues.join(" ")).not.toMatch(/camera|motion/i);
  });
  it("explicit kind controls rubric", () => {
    const image = runHeuristicDiagnostics("You are a portrait camera.", "image");
    expect(image.lacksCameraMovement).toBeUndefined();
    expect(image.issues.join(" ")).not.toMatch(/persona|camera behavior/i);
  });
  it("only the engines that support a separate negative field offer one", () => {
    expect(PROFILES.universal.negative).toBe(true);
    for (const target of ["nano-banana", "gpt-image", "veo", "omni"] as const)
      expect(PROFILES[target].negative).toBe(false);
  });
  it("replaces ratio/lens without duplicate punctuation", () => {
    const first = composePresets(
      "Bird, aspect ratio 16:9, shot on 35mm lens",
      "universal",
      "9:16",
      "85mm",
    );
    const second = composePresets(first, "universal", "1:1", "24mm");
    expect(second).toBe("Bird\nShot on 24mm lens\nAspect ratio 1:1");
    expect(composePresets(second, "universal", "", "")).toBe("Bird");
    expect(composePresets("", "universal", "1:1", "")).toBe("Aspect ratio 1:1");
  });
  it("parses active presets after ordinary edits and preserves the other selection", () => {
    const edited = "A blue bird\nShot on 35mm lens\n--ar 16:9";
    expect(parsePresets(edited)).toEqual({ ratio: "16:9", lens: "35mm" });
    const changedLens = composePresets(
      edited,
      "universal",
      parsePresets(edited).ratio,
      "85mm",
    );
    expect(changedLens).toBe(
      "A blue bird\nShot on 85mm lens\nAspect ratio 16:9",
    );
    expect(
      parsePresets("A bird, aspect ratio 2.39:1, shot on 50mm lens"),
    ).toEqual({ ratio: "2.39:1", lens: "50mm" });
    expect(parsePresets("A bird\n--ar 16:9\n--ar 1:1").ratio).toBe("1:1");
  });
  it("reference-photo action is idempotent and preserves an existing prefix", () => {
    const first = addReferencePhotoInstruction("A bird");
    expect(addReferencePhotoInstruction(first)).toBe(first);
    expect(
      addReferencePhotoInstruction("  THE SUBJECT IN THE PHOTO... a bird"),
    ).toBe("  THE SUBJECT IN THE PHOTO... a bird");
  });
});
describe("history and credentials", () => {
  it("migrates legacy history safely with no mixed metrics", () => {
    const items = migrateHistory([
      {
        id: "1",
        createdAt: 1,
        original: "Hello world",
        optimized: "Hello, world",
        summary: "Fix",
        kind: "user",
        isFavorite: true,
      },
      { original: 4 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      mode: "minimal",
      engineTarget: "universal",
      model: "deepseek-v4.1-flash",
      schemaVersion: 3,
      isFavorite: true,
    });
    // No judge ran for a legacy item: the gate stays absent, never an invented pass or fail.
    expect(items[0].qualityGate).toBeUndefined();
  });
  it("protects favorites from rolling eviction", () => {
    const favorite = { id: "favorite", isFavorite: true } as PromptHistoryItem;
    expect(
      retainHistory([
        ...Array.from(
          { length: 40 },
          (_, index) =>
            ({ id: `${index}`, isFavorite: false }) as PromptHistoryItem,
        ),
        favorite,
      ]),
    ).toHaveLength(31);
  });
  it("never persists shared token and defaults keys to session memory", () => {
    localStorage.clear();
    saveSettings({
      ...DEFAULT_SETTINGS,
      appAccessToken: "owner-secret",
      deepseekApiKey: "byok-secret",
    });
    const raw = localStorage.getItem("prompt-optimizer-settings-v3")!;
    expect(raw).not.toContain("secret");
    saveSettings({
      ...DEFAULT_SETTINGS,
      appAccessToken: "owner-secret",
      deepseekApiKey: "byok-secret",
      rememberKeys: true,
    });
    expect(loadSettings().deepseekApiKey).toBe("byok-secret");
    expect(loadSettings().appAccessToken).toBe("");
  });
  it("first load preserves legacy credentials byte-for-byte and migrates only the model", () => {
    localStorage.clear();
    const original = JSON.stringify({
      deepseekApiKey: "legacy-secret",
      deepseekModel: "deepseek-chat",
    });
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    const writes = vi.spyOn(localStorage, "setItem");
    expect(loadSettings().deepseekApiKey).toBe("");
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
    expect(inspectLegacySettings()).toEqual({
      detected: true,
      importable: true,
      malformed: false,
      invalidKeys: false,
    });
    expect(writes).not.toHaveBeenCalled();
    expect(migrateModel("deepseek-chat")).toBe("deepseek-v4.1-flash");
    expect(migrateModel("deepseek-flash")).toBe("deepseek-v4.1-flash");
    expect(migrateModel("deepseek-reasoner")).toBe("deepseek-v4-pro");
    expect(migrateModel("deepseek/deepseek-v4-pro")).toBe("deepseek-v4-pro");
  });
  it("model alias migration survives repeated loads and an explicit v3 save", () => {
    localStorage.clear();
    const original = JSON.stringify({
      deepseekApiKey: "legacy-secret",
      deepseekModel: "deepseek-reasoner",
    });
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    expect(loadSettings().deepseekModel).toBe("deepseek-v4-pro");
    expect(loadSettings().deepseekModel).toBe("deepseek-v4-pro");
    saveSettings(loadSettings());
    expect(
      JSON.parse(localStorage.getItem("prompt-optimizer-settings-v3")!)
        .deepseekModel,
    ).toBe("deepseek-v4-pro");
    expect(loadSettings().deepseekModel).toBe("deepseek-v4-pro");
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
  });
  it("explicit session import uses bounded known keys without any persistence or owner token", () => {
    localStorage.clear();
    const original = JSON.stringify({
      deepseekApiKey: " fixture-deepseek ",
      openrouterApiKey: "fixture-openrouter",
      typesafeApiKey: "retired-key",
      appAccessToken: "never-import",
      unknownApiKey: "never-import",
      deepseekModel: "deepseek-reasoner",
      rememberKeys: true,
    });
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    const writes = vi.spyOn(localStorage, "setItem");
    const imported = importLegacySettings();
    expect(imported).toMatchObject({
      deepseekApiKey: "fixture-deepseek",
      openrouterApiKey: "fixture-openrouter",
      appAccessToken: "",
      deepseekModel: "deepseek-v4-pro",
      rememberKeys: false,
      autoDiagnose: false,
    });
    expect(JSON.stringify(imported)).not.toContain("never-import");
    expect(JSON.stringify(imported)).not.toContain("retired-key");
    expect(imported).not.toHaveProperty("typesafeApiKey");
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem("prompt-optimizer-settings-v3")).toBeNull();
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
  });
  it("rejects invalid legacy key fields without losing the valid keys or saved copy", () => {
    localStorage.clear();
    const original = JSON.stringify({
      deepseekApiKey: "valid-fixture",
      openrouterApiKey: "x".repeat(513),
    });
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    expect(importLegacySettings()).toMatchObject({
      deepseekApiKey: "valid-fixture",
      openrouterApiKey: "",
    });
    expect(inspectLegacySettings()).toMatchObject({
      importable: true,
      invalidKeys: true,
    });
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
  });
  it("empty legacy keys produce no noisy credential warning", () => {
    localStorage.clear();
    localStorage.setItem(
      "prompt-optimizer-settings-v2",
      JSON.stringify({
        deepseekApiKey: "",
        openrouterApiKey: "  ",
      }),
    );
    expect(inspectLegacySettings()).toEqual({
      detected: false,
      importable: false,
      malformed: false,
      invalidKeys: false,
    });
  });
  it("malformed legacy JSON remains recoverable across load, inspection, import and save", () => {
    localStorage.clear();
    const original = "{malformed saved content";
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(inspectLegacySettings()).toMatchObject({
      detected: true,
      malformed: true,
      importable: false,
    });
    expect(() => importLegacySettings()).toThrow("unchanged");
    saveSettings(DEFAULT_SETTINGS);
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
  });
  it("only explicit forget removes legacy data; forget all removes both copies", () => {
    localStorage.clear();
    localStorage.setItem("prompt-optimizer-settings-v2", "{recoverable");
    saveSettings(DEFAULT_SETTINGS);
    forgetLegacySettings();
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBeNull();
    expect(localStorage.getItem("prompt-optimizer-settings-v3")).not.toBeNull();
    localStorage.setItem("prompt-optimizer-settings-v2", "{recoverable");
    forgetSettings();
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBeNull();
    expect(localStorage.getItem("prompt-optimizer-settings-v3")).toBeNull();
  });
  it("storage errors are not silently swallowed by load, import, save or forget", () => {
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(() => loadSettings()).toThrow("Storage blocked");
    expect(() => importLegacySettings()).toThrow("Storage blocked");
    read.mockRestore();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });
    expect(() => saveSettings(DEFAULT_SETTINGS)).toThrow("Storage full");
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("Deletion blocked");
    });
    expect(() => forgetLegacySettings()).toThrow("Deletion blocked");
    expect(() => forgetSettings()).toThrow("Deletion blocked");
  });
  it("restores historical mode/profile/checks/notes without arbitrary stored fields", () => {
    const [item] = migrateHistory([
      {
        id: "full",
        createdAt: 1,
        original: "A bird",
        optimized: "A still bird",
        summary: "Kept bird",
        kind: "video",
        mode: "creative",
        engineTarget: "veo",
        model: "deepseek-v4-pro",
        profileVersion: "veo-test",
        changes: ["Edit"],
        assumptions: ["Still"],
        questions: ["Color?"],
        warnings: ["Check"],
        qualityGate: {
          passed: true,
          intentPreserved: 0.9,
          overEngineered: 0.1,
          judge: "Microsoft-Decision-1",
        },
        deepseekApiKey: "not-allowed",
      },
    ]);
    expect(item).toMatchObject({
      mode: "creative",
      engineTarget: "veo",
      profileVersion: "veo-test",
      model: "deepseek-v4-pro",
      changes: ["Edit"],
      assumptions: ["Still"],
      unresolvedQuestions: ["Color?"],
      qualityGate: { intentPreserved: 0.9, overEngineered: 0.1, passed: true },
    });
    expect(JSON.stringify(item)).not.toContain("not-allowed");
  });
  it("history items saved with a retired engine target normalise to universal instead of being dropped", () => {
    const items = migrateHistory(
      ["midjourney", "flux", "sd", "kling", "runway"].map((engineTarget, index) => ({
        id: `old-${index}`,
        createdAt: 1,
        original: "A bird on a wire",
        optimized: "A bird perched on a wire at dawn",
        kind: "image",
        engineTarget,
      })),
    );
    expect(items).toHaveLength(5);
    for (const item of items) expect(item.engineTarget).toBe("universal");
  });
  it("gate verdicts in saved history are recomputed from scores, not trusted", () => {
    const [item] = migrateHistory([
      {
        id: "old",
        createdAt: 1,
        original: "A bird",
        optimized: "A bird in flight",
        kind: "image",
        qualityGate: {
          state: "passed",
          passed: true,
          intentPreserved: 0.2,
          overEngineered: 0.9,
        },
      },
    ]);
    expect(item.qualityGate).toMatchObject({ passed: false });
    expect(
      migrateHistory([
        {
          id: "bad",
          createdAt: 1,
          original: "A bird",
          optimized: "A bird in flight",
          qualityGate: { intentPreserved: 4, overEngineered: 0 },
        },
      ])[0].qualityGate,
    ).toBeUndefined();
  });
  it("legacy questions migrate to unresolvedQuestions", () => {
    const [item] = migrateHistory([
      {
        id: "q",
        createdAt: 1,
        original: "A bird",
        optimized: "A bird in flight",
        questions: ["Which species?"],
      },
    ]);
    expect(item.unresolvedQuestions).toEqual(["Which species?"]);
  });
});
