import type { EngineTarget, PromptKind } from "./types";

export interface TargetProfile {
  label: string;
  version: string;
  kinds: PromptKind[];
  negative: boolean;
  guidance: string;
  sources: string[];
  status: string;
}
export const PROFILES: Record<EngineTarget, TargetProfile> = {
  universal: {
    label: "General",
    version: "general-2",
    kinds: ["user", "system", "image", "video"],
    negative: true,
    guidance:
      "Plain text only; preserve existing syntax. No engine-specific flags. A separate negative prompt is offered only for image and video.",
    sources: [],
    status: "No renderer-specific compatibility claimed",
  },
  "nano-banana": {
    label: "Google Nano Banana",
    version: "nano-banana-2026-10-18",
    kinds: ["image"],
    negative: false,
    guidance: `Gemini image (Nano Banana 2 / 2.1 / Pro).
- Full natural-language sentences describing the scene, not keyword lists or weights.
- Order: subject and action, setting, lighting, camera or framing, style or medium, then mood.
- Put any text that must appear in the image in double quotes, with where it goes and its style.
- For edits or reference images: say exactly what changes, then "keep everything else exactly the same"; refer to inputs by role.
- Keep the user's aspect ratio if given, in words; never invent one. No Midjourney or Stable Diffusion parameters (--ar, --v, weights).
- There is no negative-prompt field: phrase must-avoid items inside the prompt as what to show instead.`,
    sources: ["https://ai.google.dev/gemini-api/docs/image-generation"],
    status: "Text guidance only; images are not generated here",
  },
  "gpt-image": {
    label: "ChatGPT Images",
    version: "gpt-image-2026-10-18",
    kinds: ["image"],
    negative: false,
    guidance: `ChatGPT Images (GPT Image 2 / 2.5).
- If the user gave a format or aspect ratio, state it in the first sentence (e.g. "A vertical 9:16 photo of ..."); never invent one.
- Then: subject, setting, style or medium, lighting, composition, technical details, in plain language.
- Put literal text in double quotes and say exactly where it goes; keep it short.
- For edits: name what to change and list what must stay unchanged.
- No parameters or weights. Keep exclusions to a short plain sentence.`,
    sources: ["https://platform.openai.com/docs/guides/image-generation"],
    status: "Text guidance only; images are not generated here",
  },
  veo: {
    label: "Google Veo 3.1",
    version: "veo-3.1-2026-10-18",
    kinds: ["video"],
    negative: false,
    guidance: `Google Veo 3.1.
- Cover, in order: subject, action, scene or context, camera (shot type, movement, lens), visual style, audio.
- Audio is generated with the video: give dialogue as an exact quoted line with who says it and the tone; name sound effects and ambience.
- One continuous shot of about 8 seconds unless the user asks for more; keep the motion achievable in that time. Never impose a duration the user did not state.
- Describe exclusions positively ("an empty street" rather than "no cars").
- Roughly 100-150 words; every phrase should describe something visible or audible. A static camera is valid.`,
    sources: ["https://ai.google.dev/gemini-api/docs/video"],
    status: "Text guidance only; video is not generated here",
  },
  omni: {
    label: "Gemini Omni 1.1",
    version: "omni-1.1-2026-10-18",
    kinds: ["video"],
    negative: false,
    guidance: `Gemini Omni 1.1 (Flash).
- Cover: subject, motion, camera (movement, framing, lens), style, audio.
- Refer to provided reference inputs as @Image1, @Image2, @Video1 exactly as the user names them; never invent references.
- For edits of an existing clip: state only the change, then "keep everything else the same"; do not re-describe the whole scene.
- There is no negative-prompt parameter: write must-avoid items into the prompt as positive constraints.
- Short and concrete; prefer one clear shot over a sequence.`,
    sources: [],
    status: "Text guidance only; video is not generated here",
  },
};
export { migrateModel } from "./types";
export const MODEL_SOURCE =
  "https://api-docs.deepseek.com/api/create-chat-completion";
