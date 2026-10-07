import type { PromptKind } from "./types";

export interface PromptExample {
  title: string;
  kind: PromptKind;
  description: string;
  prompt: string;
}

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    title: "SQL Query Assistant",
    kind: "user",
    description: "Database analysis task needing schema guardrails",
    prompt: `Write a SQL query for postgres to find our top 10 users who spent the most money in the last 30 days, join users and orders, make sure to handle null orders and only include completed status.`,
  },
  {
    title: "Code Reviewer Persona",
    kind: "system",
    description: "System instructions for strict senior engineering feedback",
    prompt: `You are a senior staff engineer doing PR review. Review the typescript diff carefully, point out potential memory leaks, unhandled promises, and non-idiomatic react code. Keep suggestions concise and actionable.`,
  },
  {
    title: "Cyberpunk Portrait",
    kind: "image",
    description: "Visual diffusion prompt with lighting and camera notes",
    prompt: `portrait of a cybernetic detective standing in rain under neon holographic billboard lights in Neo-Tokyo, wearing high-collar trench coat, 35mm lens photography, 8k resolution, cinematic lighting, shallow depth of field`,
  },
  {
    title: "Support Concierge",
    kind: "system",
    description: "Support persona with empathy and refund policies",
    prompt: `You are a helpful customer support agent for Acme SaaS. Answer customer billing questions politely, explain our 14-day refund policy, and ask for their invoice ID if they need a refund. Never promise things outside policy.`,
  },
];
