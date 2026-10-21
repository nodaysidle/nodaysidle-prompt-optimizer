import { describe, expect, it } from "vitest";
import { MODEL_IDS } from "@/lib/providers/completion";
import { DEFAULT_MODEL, MODELS, migrateModel } from "@/lib/types";

describe("model routing", () => {
  it("defaults to DeepSeek V4.1 Flash on both providers", () => {
    expect(MODEL_IDS[DEFAULT_MODEL]).toEqual({
      openrouter: "deepseek/deepseek-v4.1-flash",
      direct: "deepseek-flash",
    });
  });

  it("maps every saved or sent id to a current model", () => {
    expect(migrateModel("deepseek-chat")).toBe("deepseek-v4.1-flash");
    expect(migrateModel("deepseek-flash")).toBe("deepseek-v4.1-flash");
    expect(migrateModel("deepseek-reasoner")).toBe("deepseek-v4-pro");
    expect(migrateModel("deepseek/deepseek-v4-pro")).toBe("deepseek-v4-pro");
  });

  it("refuses non-DeepSeek models so server keys can't run pricier ones", () => {
    for (const hostile of ["openai/gpt-5-pro", "claude-opus", "deepseek-v3.2", "constructor", "__proto__", 42, undefined]) {
      expect(migrateModel(hostile)).toBe("deepseek-v4.1-flash");
    }
  });

  it("has a provider id for every model it can return", () => {
    for (const model of MODELS) {
      expect(MODEL_IDS[model].openrouter).toMatch(/^deepseek\//);
      expect(MODEL_IDS[model].direct).toMatch(/^deepseek-/);
    }
  });
});
