import type { PromptKind } from "./types";

export interface PromptExample {
  title: string;
  kind: PromptKind;
  description: string;
  prompt: string;
}

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    title: "Veo 3.1 Supermoto Drift",
    kind: "video",
    description: "Temporal drift with tire smoke and camera tracking in Trieste",
    prompt: `A young man power-sliding a matte black 2008 Honda CRF450R supermoto motorcycle full throttle sideways across a sun-baked cobblestone piazza in Trieste Italy with Adriatic Sea background, tire smoke billowing, pedestrian crowd reacting in awe, harsh midday sun, photorealistic Canon EOS R5.`,
  },
  {
    title: "Kling / Runway FPV Chase",
    kind: "video",
    description: "High-speed camera path through neon cyber city",
    prompt: `FPV drone descending through misty cyberpunk neon canyon, chasing an agile futuristic hoverbike through narrow wet alleyways with neon reflection puddles, rapid banking turns, sparks flying from wall scrapes, cinematic anamorphic lens.`,
  },
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
