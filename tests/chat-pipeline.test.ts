import { beforeEach, describe, expect, it, vi } from "vitest";
import { optimizePrompt, rewriteMaxTokens } from "@/lib/providers/chat";
import type { DiagnosticResult } from "@/lib/types";

vi.mock("@/lib/providers/deepseek", () => ({
  chatDeepSeek: vi.fn(),
}));

vi.mock("@/lib/decisions", () => ({
  MIN_IMPROVEMENT: 0.45,
  runDiagnostics: vi.fn(),
  runQualityGate: vi.fn(),
}));

import { chatDeepSeek } from "@/lib/providers/deepseek";
import { runDiagnostics, runQualityGate } from "@/lib/decisions";

const mockedChat = vi.mocked(chatDeepSeek);
const mockedGate = vi.mocked(runQualityGate);
const mockedDiagnostics = vi.mocked(runDiagnostics);

const baseDiagnostics: DiagnosticResult = {
  clarityScore: 2,
  clarityLabel: "Clear instructions / Good constraints",
  isAmbiguous: 0.2,
  lacksConstraints: 0.2,
  lacksRole: 0.5,
  injectionRisk: 0,
  issues: [],
  strengths: [],
  unresolvedQuestions: [],
  engine: "test",
};

const rewritePayload = (optimized: string, extras: Record<string, unknown> = {}) =>
  JSON.stringify({ optimized, questions: [], summary: "Improved.", changes: ["x"], ...extras });

function responseJson(optimized: string) {
  return completion(rewritePayload(optimized));
}

/** What the completion client returns: the model text plus its metadata. */
function completion(content: string) {
  return { content, model: "deepseek/deepseek-v4.1-flash", elapsedMs: 5 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDiagnostics.mockResolvedValue(baseDiagnostics);
});

describe("optimizePrompt pipeline", () => {
  it("returns the first candidate when verification passes", async () => {
    mockedChat.mockResolvedValue(responseJson("A crisp rewrite of the task."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "Explain closures with one example.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.optimized).toBe("A crisp rewrite of the task.");
    expect(mockedChat).toHaveBeenCalledTimes(1);
    expect(mockedGate).toHaveBeenCalledTimes(1);
  });

  it("repairs exactly once when verification fails, then succeeds", async () => {
    mockedChat
      .mockResolvedValueOnce(responseJson("Rewrite drop idea drop number 555."))
      .mockResolvedValueOnce(responseJson("Rewrite that preserves requirement 555."));
    mockedGate
      .mockResolvedValueOnce({ intentPreserved: 0.4, overEngineered: 0.2, passed: false })
      .mockResolvedValueOnce({ intentPreserved: 0.9, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "Rewrite that keeps requirement 555.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(mockedChat).toHaveBeenCalledTimes(2);
    expect(result.optimized).toContain("555");
    expect(result.qualityGate?.passed ?? false).toBe(true);
    const secondCall = mockedChat.mock.calls[1][0];
    expect(secondCall.system).toContain("QUALITY REPAIR PASS");
  });

  it("preserves the original prompt when repair also fails", async () => {
    const original = "Do a full pass on my landing page copy.";
    mockedChat.mockResolvedValue(responseJson("An expanded corporate-deck rewrite bloated with filler."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.4, overEngineered: 0.8, passed: false });

    const result = await optimizePrompt({
      prompt: original,
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.optimized).toBe(original);
    expect(result.changes).toEqual([]);
    expect(result.summary).toContain("preserved unchanged");
    expect(mockedChat).toHaveBeenCalledTimes(2);
    expect(result.rejectedDraft?.reason).toBe("failed");
    expect(result.rejectedDraft?.optimized).toContain("corporate-deck");
    expect(result.rejectedDraft?.problems.join(" ")).toMatch(/intent match only 40%/);
  });

  it("flags fabricated placeholders and refuses to lose verbatim numbers", async () => {
    mockedChat
      .mockResolvedValueOnce(responseJson("Answer in [target audience] tone, budget 300 days."))
      .mockResolvedValueOnce(responseJson("Keep exactly the 300 day budget, no audience invented."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.05, passed: true });

    const result = await optimizePrompt({
      prompt: "Answer with 300 days budget.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.optimized).toContain("300");
    expect((result.optimized.match(/\[[^\]]+\]/g) ?? [])).toEqual([]);
  });

  it("enforces the identity lock for subject-photo prompts", async () => {
    mockedChat.mockResolvedValue(responseJson("A red car in the rain."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "The subject from the photo standing in the rain",
      kind: "image",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.optimized.startsWith("Use photo in the attachment")).toBe(true);
    // The gate judges against the locked original, so the lock itself isn't scored as drift.
    expect(mockedGate.mock.calls[0][0].original.startsWith("Use photo in the attachment")).toBe(true);
  });

  it("surfaces unresolved questions in the result", async () => {
    mockedChat.mockResolvedValue(
      completion(
        JSON.stringify({
          optimized: "A rewrite.",
          questions: ["What tone should I use?"],
          summary: "s",
          changes: ["c"],
        }),
      ),
    );
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "Rewrite this opener, please and thanks.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.unresolvedQuestions).toContain("What tone should I use?");
  });

  it("keeps the original when the rewrite passes but is not clearly better", async () => {
    const original = "List three uses of Rust's borrow checker.";
    mockedChat.mockResolvedValue(responseJson("List three practical uses of Rust's borrow checker."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, improvement: 0.2, passed: true });

    const result = await optimizePrompt({
      prompt: original,
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.optimized).toBe(original);
    expect(result.summary).toContain("already effective");
    expect(result.rejectedDraft?.reason).toBe("marginal");
    expect(result.rejectedDraft?.optimized).toContain("practical uses");
    expect(mockedChat).toHaveBeenCalledTimes(1);
  });

  it("returns the rewrite when Decision-1 sees a clear improvement", async () => {
    mockedChat.mockResolvedValue(responseJson("A much clearer task."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.9, overEngineered: 0.1, improvement: 0.8, passed: true });

    const result = await optimizePrompt({
      prompt: "do the thing with the data",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.optimized).toBe("A much clearer task.");
    expect(result.rejectedDraft).toBeUndefined();
  });

  it("prefers the rewriter's specific questions over generic diagnostic ones", async () => {
    mockedDiagnostics.mockResolvedValue({
      ...baseDiagnostics,
      unresolvedQuestions: ["What specific outcome makes this task a success?"],
    });
    mockedChat.mockResolvedValue(
      completion(
        JSON.stringify({ optimized: "A rewrite.", questions: ["Which audience is the email for?"], summary: "s", changes: ["c"] }),
      ),
    );
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "Write the email.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.unresolvedQuestions).toEqual(["Which audience is the email for?"]);
  });

  it("falls back to diagnostic questions when the rewriter asks none", async () => {
    mockedDiagnostics.mockResolvedValue({
      ...baseDiagnostics,
      unresolvedQuestions: ["What specific outcome makes this task a success?"],
    });
    mockedChat.mockResolvedValue(responseJson("A rewrite."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "Write the email.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(result.unresolvedQuestions).toEqual(["What specific outcome makes this task a success?"]);
  });

  it("passes an output budget that grows with the prompt", async () => {
    mockedChat.mockResolvedValue(responseJson("A rewrite."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });
    const longPrompt = "Rule: keep answers short. ".repeat(600);

    await optimizePrompt({ prompt: longPrompt, kind: "system", deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash", openrouterApiKey: "sk-or-test" });

    expect(mockedChat.mock.calls[0][0].maxTokens).toBe(rewriteMaxTokens(longPrompt));
    expect(rewriteMaxTokens(longPrompt)).toBe(8000);
    expect(rewriteMaxTokens("short")).toBe(2200);
  });

  it("retries once when the model returns something unusable, then succeeds", async () => {
    mockedChat
      .mockResolvedValueOnce(completion("I am sorry, here is some prose and no JSON."))
      .mockResolvedValueOnce(responseJson("A crisp rewrite of the task."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });

    const result = await optimizePrompt({
      prompt: "Explain closures with one example.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
    });

    expect(mockedChat).toHaveBeenCalledTimes(2);
    expect(result.optimized).toBe("A crisp rewrite of the task.");
  });

  it("fails loudly instead of returning raw model text when it never parses", async () => {
    mockedChat.mockResolvedValue(completion("Still no JSON here, just chatter."));

    await expect(
      optimizePrompt({
        prompt: "Explain closures with one example.",
        kind: "user",
        deepseekApiKey: "sk-test",
        model: "deepseek-v4.1-flash",
        openrouterApiKey: "sk-or-test",
      }),
    ).rejects.toThrow(/required format/);
  });

  it("reports the real stages in order, and repair only when needed", async () => {
    mockedChat.mockResolvedValue(responseJson("A crisp rewrite of the task."));
    mockedGate.mockResolvedValue({ intentPreserved: 0.95, overEngineered: 0.1, passed: true });
    const stages: string[] = [];

    await optimizePrompt({
      prompt: "Explain closures with one example.",
      kind: "user",
      deepseekApiKey: "sk-test",
      model: "deepseek-v4.1-flash",
      openrouterApiKey: "sk-or-test",
      onStage: (stage) => stages.push(stage),
    });

    expect(stages).toEqual(["diagnose", "rewrite", "verify"]);
  });

  it("never reads the server's OpenRouter key to run the gate", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-server-secret";
    mockedChat.mockResolvedValue(responseJson("A crisp rewrite of the task."));
    try {
      const result = await optimizePrompt({
        prompt: "Explain closures with one example.",
        kind: "user",
        deepseekApiKey: "sk-test",
        model: "deepseek-v4.1-flash",
      });
      expect(mockedGate).not.toHaveBeenCalled();
      expect(result.qualityGate).toBeUndefined();
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });
});
