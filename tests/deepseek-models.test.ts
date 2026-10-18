import { describe, expect, it } from "vitest";
import { resolveModels } from "@/lib/providers/deepseek";

describe("resolveModels", () => {
  it("defaults to DeepSeek V4.1 Flash on both providers", () => {
    expect(resolveModels()).toEqual({ openrouter: "deepseek/deepseek-v4.1-flash", direct: "deepseek-flash" });
    expect(resolveModels("deepseek-v4.1-flash")).toEqual({ openrouter: "deepseek/deepseek-v4.1-flash", direct: "deepseek-flash" });
  });

  it("maps older saved choices to their V4 successors", () => {
    expect(resolveModels("deepseek-chat").openrouter).toBe("deepseek/deepseek-v4.1-flash");
    expect(resolveModels("deepseek-reasoner")).toEqual({ openrouter: "deepseek/deepseek-v4-pro", direct: "deepseek-v4-pro" });
  });

  it("passes a full OpenRouter id through unchanged", () => {
    expect(resolveModels("deepseek/deepseek-v4-flash").openrouter).toBe("deepseek/deepseek-v4-flash");
  });
});
