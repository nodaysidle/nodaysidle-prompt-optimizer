import type { DiagnosticResult, EngineTarget, PromptKind } from "./types";

export const IDENTITY_LOCK_OUTPUT =
  "Use photo in the attachment as only reference. Identity lock: exact likeness, facial geometry / proportions.";

export function isSubjectInPhotoPrompt(prompt: string): boolean {
  return /^the subject in the photo/i.test(prompt.trim());
}

export function isOnlySubjectPrompt(prompt: string): boolean {
  if (!isSubjectInPhotoPrompt(prompt)) return false;
  const rest = prompt.trim().replace(/^the subject in the photo(\.{1,3}|:)?\s*/i, "");
  return rest.length === 0;
}

export function enforceIdentityLock(optimized: string, kind: PromptKind): string {
  const prefix = IDENTITY_LOCK_OUTPUT;
  const trimmed = optimized.trim();

  if (trimmed === prefix) return prefix;
  if (trimmed.startsWith(prefix)) return trimmed;

  // If model produced a slight variation of the prefix at start, replace it
  const fuzzy = /^use photo in the attachment[^.\n]*\.[^\n.]*(?:\.|\n)?/i;
  let remaining = trimmed;
  if (fuzzy.test(remaining)) {
    remaining = remaining.replace(fuzzy, "").trim();
  }

  // Remove any leftover duplicate "The subject in the photo..." if present
  remaining = remaining.replace(/^the subject in the photo(\.{1,3}|:)?\s*/i, "").trim();

  if (!remaining) {
    return prefix;
  }

  if (kind === "video" && remaining.startsWith("[")) {
    return `${prefix}\n\n${remaining}`.trim();
  }

  return `${prefix} ${remaining}`.trim();
}

const ENGINE_TARGET_GUIDANCE: Partial<Record<EngineTarget, string>> = {
  midjourney: `TARGET ENGINE PROFILE: MIDJOURNEY v6.1
- Structure the visual prompt with evocative comma-separated stylistic tags, lighting, lens specs, and aesthetic attributes.
- Append appropriate Midjourney parameters at the very end of the prompt (e.g. --v 6.1 --style raw --ar 16:9).
- Avoid unnecessary conversational filler words.`,
  flux: `TARGET ENGINE PROFILE: FLUX.1
- Focus on natural descriptive prose, tactile texture, micro-details, and realistic photographic lighting.
- Flux responds best to rich narrative paragraphs rather than comma soup.`,
  sd: `TARGET ENGINE PROFILE: STABLE DIFFUSION / SDXL
- Use weighted quality tokens, explicit photographic focal lengths (e.g., 85mm f/1.4), masterpiece lighting cues, and clear composition hierarchy.`,
  veo: `TARGET ENGINE PROFILE: GOOGLE VEO 3.1
- Emphasize temporal pacing, realistic kinematics, secondary fluid/particle simulation, and cinematic camera choreography.`,
  kling: `TARGET ENGINE PROFILE: KLING 1.5 / 2.0
- Emphasize character motion continuity, contact mechanics, realistic physical weight, and sweeping orbital/tracking camera movements.`,
  runway: `TARGET ENGINE PROFILE: RUNWAY GEN-3 ALPHA
- Focus on director-level cinematography, camera cranes/dollies, focal lengths, lighting transitions, and keyframe evolution.`,
};

const KIND_GUIDANCE: Record<PromptKind, string> = {
  user: `This is a USER prompt (the task or question sent to an LLM). Improve clarity, specificity, step-by-step reasoning triggers, structural boundaries, and explicit negative constraints. Preserve the user's intent. Add missing context placeholders using [brackets].`,
  system: `This is a SYSTEM prompt (governing instructions for an LLM persona). Improve role definition, boundary enforcement, output formatting schema (e.g. JSON/markdown), safety rules, and anti-hallucination guardrails. Keep it actionable and unambiguous.`,
  image: `This is an IMAGE GENERATION prompt (for Google Nano Banana, GPT-1.5 Image, Midjourney, Flux, Stable Diffusion). Improve subject details, composition, lighting, style/medium, camera/lens cues, color palette, and aspect ratio recommendations. Provide a rich, cohesive visual description without raw JSON dictionaries so the user can directly copy-paste it into image generators.

MANDATORY REFERENCE PHOTO RULE:
If the user's prompt starts with "The subject in the photo" (e.g. "The subject in the photo..."), the output MUST start with:
"${IDENTITY_LOCK_OUTPUT}"
followed by the rest of the visual description. If the input prompt does NOT start with "The subject in the photo" (such as "a flying dragon above paris"), do NOT apply this rule.`,
  video: `This is a VIDEO GENERATION prompt specifically engineered for premier video foundation models: Google Veo 3.1, Google Omni, Kling (1.5/2.0), and Runway (Gen-3 Alpha).
Video models need temporal pacing, subject action over time, camera trajectory/kinetics, physics/secondary motion, and lighting evolution across duration.
CRITICAL FORMATTING INSTRUCTIONS FOR VIDEO:
Do NOT output a JSON dictionary in the prompt. Output a clean, high-density structured plain-text prompt using standard video prompt tags:
- [SCENE & SUBJECT]: Subject visual appearance, attire/materials, starting pose, environment architecture, spatial atmosphere.
- [TEMPORAL ACTION & DYNAMICS]: Second-by-second action progression (0-2s start, 2-5s climax, 5-8s resolution), speed changes, contact mechanics, and secondary physics (tire smoke, dust particles, water spray, cloth/hair simulation).
- [CAMERA PATH & CINEMATOGRAPHY]: Precise lens movement (low-angle tracking, orbital pan, crane push-in, FPV chase, gimbal sweep), focal length (e.g. 24mm anamorphic), shutter speed/motion blur, framing, and depth of field.
- [LIGHTING & ATMOSPHERE]: Sun position, atmospheric haze, color grading, shadows, volumetric god rays, reflections.
- [NEGATIVE / ARTIFACT GUARDS]: Exclude static pauses, unnatural body morphing, jitter, rubbery limbs, sudden camera snapping, synthetic over-smoothing.

MANDATORY REFERENCE PHOTO RULE:
If the user's prompt starts with "The subject in the photo" (e.g. "The subject in the photo..."), the output MUST start with:
"${IDENTITY_LOCK_OUTPUT}"
followed by the rest of the structured video prompt. If the input prompt does NOT start with "The subject in the photo" (such as "a flying dragon above paris"), do NOT apply this rule.`,
};

export function buildOptimizerMessages(
  prompt: string,
  kind: PromptKind,
  diagnostics?: DiagnosticResult,
  engineTarget?: EngineTarget,
) {
  let diagnosticContext = "";
  if (diagnostics && diagnostics.issues.length > 0) {
    diagnosticContext = `
System One Diagnostics detected specific flaws in the input:
${diagnostics.issues.map((issue) => `- ${issue}`).join("\n")}
Focus specifically on fixing these diagnostic flaws in your rewrite while maintaining the core intent.`;
  }

  let subjectRuleContext = "";
  if ((kind === "image" || kind === "video") && isSubjectInPhotoPrompt(prompt)) {
    subjectRuleContext = `
STRICT IDENTITY LOCK MANDATE:
The user prompt begins with "The subject in the photo".
You MUST start your "optimized" rewritten prompt with this EXACT sentence:
"${IDENTITY_LOCK_OUTPUT}"
${
  isOnlySubjectPrompt(prompt)
    ? 'Since no additional scene details were provided, the "optimized" prompt field MUST BE EXACTLY this sentence and nothing else.'
    : 'Follow this exact sentence immediately with the enhanced visual, lighting, cinematic, and compositional details for the remainder of the prompt.'
}
Do NOT deviate from this phrasing under any circumstances.`;
  }

  const engineContext =
    engineTarget && ENGINE_TARGET_GUIDANCE[engineTarget]
      ? `\n${ENGINE_TARGET_GUIDANCE[engineTarget]}\n`
      : "";

  const isVisual = kind === "image" || kind === "video";
  const negativePromptSchema = isVisual
    ? `\n  "negativePrompt": "comma-separated list of 8-12 unwanted visual defects, artifacts, distortions, or morphing anomalies to avoid",`
    : "";

  const system = `You are an elite prompt engineer. Analyze the user's prompt and rewrite it into a production-grade, highly effective version.

${KIND_GUIDANCE[kind]}
${engineContext}
${diagnosticContext}
${subjectRuleContext}

You MUST return a JSON object with this exact schema:
{
  "optimized": "the full rewritten prompt text",${negativePromptSchema}
  "summary": "2-3 sentence explanation of what improved",
  "changes": ["bullet change 1", "bullet change 2", "bullet change 3"]
}`;

  const user = `Prompt type: ${kind}${engineTarget ? ` | Target Engine: ${engineTarget}` : ""}

--- ORIGINAL PROMPT ---
${prompt}
--- END ORIGINAL PROMPT ---`;

  return { system, user };
}

const DEFAULT_NEGATIVES: Record<string, string> = {
  image:
    "deformed anatomy, extra limbs, bad hands, missing fingers, distorted face, blurry, plastic skin, oversaturated, low quality, artifacts, watermark, logo",
  video:
    "static pause, frame stutter, jerky camera movement, limb distortion, rubbery morphing, frame flicker, over-smoothing, synthetic plastic sheen, digital compression artifacts",
};

export function parseOptimizationResponse(
  text: string,
  kind?: PromptKind,
  originalPrompt?: string,
): {
  optimized: string;
  negativePrompt?: string;
  summary: string;
  changes: string[];
} {
  const trimmed = text.trim();

  // 1. Remove markdown fences if present
  let clean = trimmed;
  if (clean.includes("```")) {
    const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      clean = codeBlockMatch[1].trim();
    }
  }

  // 2. Extract outermost JSON object
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  let optimized = "";
  let negativePrompt: string | undefined = undefined;
  let summary = "Prompt structure, clarity, and constraints optimized.";
  let changes: string[] = ["Refined clarity and task specificity"];

  // 3. Attempt JSON parse
  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed.optimized === "string") {
      optimized = parsed.optimized.trim();
      summary = parsed.summary?.trim() || summary;
      if (typeof parsed.negativePrompt === "string" && parsed.negativePrompt.trim()) {
        negativePrompt = parsed.negativePrompt.trim();
      }
      if (Array.isArray(parsed.changes)) {
        changes = parsed.changes.map((c: unknown) => String(c).trim()).filter(Boolean);
      }
    }
  } catch {
    // If strict parse failed, attempt regex extraction for individual fields
    const optMatch = clean.match(/"optimized"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const sumMatch = clean.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const negMatch = clean.match(/"negativePrompt"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    if (optMatch) {
      try {
        optimized = JSON.parse(`"${optMatch[1]}"`);
        if (sumMatch) summary = JSON.parse(`"${sumMatch[1]}"`);
        if (negMatch) negativePrompt = JSON.parse(`"${negMatch[1]}"`);
        changes = ["Extracted and optimized prompt constraints"];
      } catch {
        // continue to fallback
      }
    }
  }

  if (!optimized) {
    // 4. Fallback: If model completely failed to format JSON, use the raw response
    optimized = trimmed.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
    summary = "Rewritten prompt generated directly by model.";
    changes = ["Enhanced instructions and structure"];
  }

  // Supply default negative prompt for image and video if omitted
  if ((kind === "image" || kind === "video") && !negativePrompt) {
    negativePrompt = DEFAULT_NEGATIVES[kind] || DEFAULT_NEGATIVES.image;
    if (originalPrompt && isSubjectInPhotoPrompt(originalPrompt)) {
      negativePrompt = `identity mismatch, facial morphing, different person, ${negativePrompt}`;
    }
  }

  return {
    optimized,
    negativePrompt,
    summary,
    changes,
  };
}
