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
    version: "nano-banana-2026-11-08",
    kinds: ["image"],
    negative: false,
    guidance: `Gemini image (Nano Banana 2.1 by default; also 2, 2 Lite and Pro).
- Full natural-language sentences describing the scene, not keyword lists or weights.
- Order: subject and action, setting, lighting, camera or framing, style or medium, then mood. If the user said what the image is for, keep that purpose in the prompt.
- Open by naming the medium ("A photorealistic photograph of...") and use camera language for framing (wide-angle, low-angle, macro) when the user wants a photo look. Crowded scenes: describe foreground, middle and background in order.
- Put any text that must appear in the image in double quotes, with where it goes and its style.
- For edits or reference images: "change only" the named element, then "keep everything else exactly the same"; refer to inputs by their role (subject, style, background).
- Keep the user's aspect ratio if given, in words; never invent one. No Midjourney or Stable Diffusion parameters (--ar, --v, weights).
- There is no negative-prompt field. Keep explicit user exclusions verbatim ("no text", "no watermark"); describe any other must-avoid item as what to show instead ("an empty street", not "no cars").`,
    sources: ["https://ai.google.dev/gemini-api/docs/image-generation"],
    status: "Text guidance only; images are not generated here",
  },
  "gpt-image": {
    label: "ChatGPT Images",
    version: "gpt-image-2026-11-08",
    kinds: ["image"],
    negative: false,
    guidance: `ChatGPT Images (GPT Image 2.6 Sunburst and Flare).
- Name the subject and, if the user gave it, the intended use (poster, product photo, avatar).
- Then: setting, style or medium, lighting, composition, and the user's format or aspect ratio in words; never invent one. Supported ratios run from 3:1 to 1:3.
- Say "photorealistic" or "real photograph" when the user wants realism; describe people's pose, gaze and hand placement precisely.
- For a complex scene, short labeled parts are fine: Scene, Subject, Details, Constraints.
- Put literal text in double quotes with its position and typography. When the user gave the text, add "no other text" so nothing extra is lettered.
- For edits: "change only" the named element and list what must stay unchanged.
- Refer to input images by number and purpose ("Image 1 is the subject reference").
- No parameters or weights. Keep the user's exclusions as one short plain sentence.`,
    sources: [
      "https://developers.openai.com/api/docs/guides/image-generation",
      "https://developers.openai.com/api/docs/guides/image-prompting",
    ],
    status: "Text guidance only; images are not generated here",
  },
  veo: {
    label: "Google Veo 3.1",
    version: "veo-3.1-2026-11-08",
    kinds: ["video"],
    negative: true,
    guidance: `Google Veo 3.1 (GA on Agent Platform).
- Natural-language prose in this order: subject, action, scene or context, camera (shot type, movement, lens), visual style, then audio in its own sentences.
- Audio is generated with the video: give dialogue as an exact quoted line with who says it and the tone; name sound effects and ambience.
- One clip is 4, 6 or 8 seconds (8 with reference images, 1080p or 4K). Keep the motion achievable in one clip. Never impose a duration the user did not state and never write this limit into the prompt; if they asked for more, keep their request as written (the app warns them).
- Use up to three reference images; name each by role ("the attached image is the subject reference") and never invent one.
- Portrait 9:16 and landscape 16:9; 720p, 1080p and 4K.
- Veo has a separate negative prompt: put exclusions there as plain nouns ("text, watermark"), and in the prompt describe the wanted scene positively ("an empty street").
- Label sound in separate sentences ("SFX: ...", "Ambient: ...") and write dialogue as who says it and the line.
- Concise: every phrase describes something visible or audible. A static camera is valid.`,
    sources: [
      "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate",
      "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text",
      "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide",
    ],
    status:
      "Text guidance only; video is not generated here. Veo 3.1 GA runs on Agent Platform; the Gemini API preview IDs shut down October 22, 2026",
  },
  omni: {
    label: "Gemini Omni 1.1",
    version: "omni-1.1-2026-11-08",
    kinds: ["video"],
    negative: false,
    guidance: `Gemini Omni 1.1 Flash (legacy).
- Natural-language prose covering: subject, motion, camera (movement, framing, lens), style, audio.
- One clip is at most 10 seconds; never write this limit into the prompt, and keep a longer request as written (the app warns the user). By default it may cut between shots; for one scene say "single continuous shot".
- Describe each reference input by its role in plain language ("use the attached image as the identity reference for the subject"); never invent a reference and never use tags.
- For edits of an existing clip: state only the change, then "keep everything else the same"; do not re-describe the whole scene.
- Audio is generated by default: direct it in its own sentences (ambience, music) or write "No dialogue" to mute speech.
- There is no negative-prompt field: write exclusions inline as short "No ..." sentences ("No dialogue").`,
    sources: [
      "https://blog.google/innovation-and-ai/technology/developers-tools/build-with-gemini-omni-1-1-flash/",
      "https://aistudio.google.com/docs/omni.md",
    ],
    status:
      "Legacy: requests to Omni 1.1 route to Omni 1.2 from December 3, 2026. Text guidance only; video is not generated here",
  },
  "omni-1.2": {
    label: "Google Omni 1.2 Flash",
    version: "omni-1.2-2026-11-08",
    kinds: ["video"],
    negative: false,
    guidance: `Gemini Omni 1.2 Flash.
- Write a natural-language film brief, not an agent Goal/Context brief. Cover: subject and setting, specific action, camera (shot size, lens, movement, height), lighting and mood, audio, and on-screen text.
- Use timecodes for timed events: [0-5s], [5-10s], [10-15s]. The model supports 3 to 15 seconds and defaults to 10. Do not invent a duration; the renderer's duration setting overrides the prompt.
- By default the model may cut between shots. For one scene, say "single continuous shot", "unbroken shot" or "no scene cuts".
- Audio is generated natively. Name ambience, sound effects, music and exact dialogue. Audio input or audio references are not supported.
- On-screen text: give the exact string in double quotes, where it appears and its style. Treat it as a request, not a guarantee.
- References: up to 6 images (up to 3 per character, at most 2 characters). Describe each reference's role in natural language ("use the attached image as the identity reference for ..."). Never use deprecated tags such as <IMAGE_REF_0> or <VIDEO_REF_0>.
- For edits of an existing clip: keep it short. Describe one change, then "keep everything else the same"; do not re-describe the whole scene.
- There is no negative-prompt field: put exclusions inline as short "No ..." sentences ("No dialogue", "No extra sound effects").
- 1080p and 4K are upscaled, not native. English is fully supported; other languages may vary.`,
    sources: [
      "https://aistudio.google.com/docs/omni.md",
      "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash",
    ],
    status: "Text guidance only; video is not generated here",
  },
};
export { migrateModel } from "./types";
export const MODEL_SOURCE =
  "https://api-docs.deepseek.com/api/create-chat-completion";
