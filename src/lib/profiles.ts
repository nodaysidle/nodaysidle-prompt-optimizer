import type { EngineTarget, PromptKind } from "./types";

export interface TargetProfile {
  label: string;
  version: string;
  kinds: PromptKind[];
  negative: boolean;
  syntax: "prose" | "midjourney";
  guidance: string;
  sources: string[];
  status: string;
}
export const PROFILES: Record<EngineTarget, TargetProfile> = {
  universal: {
    label: "General text",
    version: "general-1",
    kinds: ["user", "system", "image", "video"],
    negative: false,
    syntax: "prose",
    guidance:
      "Plain text only; preserve existing syntax. No engine-specific flags.",
    sources: [],
    status: "No renderer-specific compatibility claimed",
  },
  midjourney: {
    label: "Midjourney v6.1 (historical)",
    version: "mj-6.1-1",
    kinds: ["image"],
    negative: true,
    syntax: "midjourney",
    guidance:
      "Historical v6.1. Preserve explicit --ar/--no parameters, compose each once. Do not invent parameters or aspect ratio.",
    sources: [
      "https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version",
      "https://docs.midjourney.com/hc/en-us/articles/31894244298125-Aspect-Ratio",
    ],
    status: "Historical profile; verify parameters in your renderer",
  },
  flux: {
    label: "FLUX.2",
    version: "flux-2-2026-10-14",
    kinds: ["image"],
    negative: false,
    syntax: "prose",
    guidance:
      "Natural descriptive prose. FLUX.2 does not support negative prompts. Preserve style and composition without adding details.",
    sources: ["https://docs.bfl.ai/guides/prompting_guide_flux2"],
    status: "Prompting contract reviewed 2026-10-14",
  },
  sd: {
    label: "SDXL (historical)",
    version: "sdxl-1-limited",
    kinds: ["image"],
    negative: true,
    syntax: "prose",
    guidance:
      "Historical SDXL text profile; negative input is separate. Weighting syntax depends on the host and is not added.",
    sources: [
      "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
    ],
    status: "Limited historical profile; host syntax varies",
  },
  veo: {
    label: "Veo 3.1 (legacy workflow)",
    version: "veo-3.1-2026-10-14",
    kinds: ["video"],
    negative: true,
    syntax: "prose",
    guidance:
      "Describe supplied action, duration and camera intent. Static camera is valid. Negative input is separate where exposed by host. Never impose duration.",
    sources: ["https://ai.google.dev/gemini-api/docs/video"],
    status: "Legacy workflow; text review only, not video generation",
  },
  kling: {
    label: "Kling 1.5/2.0 (historical)",
    version: "kling-1.5-2.0-limited",
    kinds: ["video"],
    negative: false,
    syntax: "prose",
    guidance:
      "Historical prose-only profile. Preserve supplied action and camera intent. Unsupported negative-field contract: omit it.",
    sources: ["https://app.klingai.com/global/"],
    status: "Support limited; host capabilities not verified",
  },
  runway: {
    label: "Runway Gen-3 (historical)",
    version: "runway-gen3-limited",
    kinds: ["video"],
    negative: false,
    syntax: "prose",
    guidance:
      "Historical Gen-3 prose-only profile. Preserve supplied motion and static-camera intent; no unsupported negative field.",
    sources: [
      "https://help.runwayml.com/hc/en-us/articles/30586818553107-Gen-3-Alpha-Prompting-Guide",
    ],
    status: "Support limited; historical text guidance only",
  },
};
export const MODEL_SOURCE =
  "https://api-docs.deepseek.com/api/create-chat-completion";
export function migrateModel(value: unknown) {
  return value === "deepseek-v4-pro" || value === "deepseek-reasoner"
    ? ("deepseek-v4-pro" as const)
    : ("deepseek-flash" as const);
}
