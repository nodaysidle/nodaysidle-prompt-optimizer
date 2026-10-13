import { complete } from "./completion";
import type { Model, PromptKind } from "../types";

export async function chatDeepSeek(params: { apiKey: string; model: Model; system: string; user: string; jsonMode?: boolean; signal?: AbortSignal }) {
  return complete({ ...params, messages: [{ role: "system", content: params.system }, { role: "user", content: params.user }] });
}
export function testMessages(prompt: string, kind: PromptKind, testInput = "") {
  if (kind === "image" || kind === "video") throw new Error("Visual prompts support text review only, not text execution.");
  if (kind === "system") return [{ role: "system" as const, content: prompt }, { role: "user" as const, content: testInput || "Follow the system instructions for this test." }];
  return [{ role: "user" as const, content: prompt + (testInput ? `\n\nScenario data:\n${testInput}` : "") }];
}
export async function runPromptTest(params: { apiKey: string; model: Model; prompt: string; kind: PromptKind; testInput?: string; temperature: number; maxTokens: number; signal?: AbortSignal }) {
  return complete({ ...params, messages: testMessages(params.prompt, params.kind, params.testInput) });
}
