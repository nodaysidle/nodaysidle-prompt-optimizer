import type { DiagnosticResult, PromptKind } from "./types";

const KIND_GUIDANCE: Record<PromptKind, string> = {
  user: `This is a USER prompt (the task or question sent to an LLM). Improve clarity, specificity, step-by-step reasoning triggers, structural boundaries, and explicit negative constraints. Preserve the user's intent. Add missing context placeholders using [brackets].`,
  system: `This is a SYSTEM prompt (governing instructions for an LLM persona). Improve role definition, boundary enforcement, output formatting schema (e.g. JSON/markdown), safety rules, and anti-hallucination guardrails. Keep it actionable and unambiguous.`,
  image: `This is an IMAGE GENERATION prompt (for Google Nano Banana, GPT-1.5 Image, Midjourney, Flux, Stable Diffusion). Improve subject details, composition, lighting, style/medium, camera/lens cues, color palette, and aspect ratio recommendations. Provide a rich, cohesive visual description without raw JSON dictionaries so the user can directly copy-paste it into image generators.`,
  video: `This is a VIDEO GENERATION prompt specifically engineered for premier video foundation models: Google Veo 3.1, Google Omni, Kling (1.5/2.0), and Runway (Gen-3 Alpha).
Video models need temporal pacing, subject action over time, camera trajectory/kinetics, physics/secondary motion, and lighting evolution across duration.
CRITICAL FORMATTING INSTRUCTIONS FOR VIDEO:
Do NOT output a JSON dictionary in the prompt. Output a clean, high-density structured plain-text prompt using standard video prompt tags:
- [SCENE & SUBJECT]: Subject visual appearance, attire/materials, starting pose, environment architecture, spatial atmosphere.
- [TEMPORAL ACTION & DYNAMICS]: Second-by-second action progression (0-2s start, 2-5s climax, 5-8s resolution), speed changes, contact mechanics, and secondary physics (tire smoke, dust particles, water spray, cloth/hair simulation).
- [CAMERA PATH & CINEMATOGRAPHY]: Precise lens movement (low-angle tracking, orbital pan, crane push-in, FPV chase, gimbal sweep), focal length (e.g. 24mm anamorphic), shutter speed/motion blur, framing, and depth of field.
- [LIGHTING & ATMOSPHERE]: Sun position, atmospheric haze, color grading, shadows, volumetric god rays, reflections.
- [NEGATIVE / ARTIFACT GUARDS]: Exclude static pauses, unnatural body morphing, jitter, rubbery limbs, sudden camera snapping, synthetic over-smoothing.`,
};

export function buildOptimizerMessages(
  prompt: string,
  kind: PromptKind,
  diagnostics?: DiagnosticResult,
) {
  let diagnosticContext = "";
  if (diagnostics && diagnostics.issues.length > 0) {
    diagnosticContext = `
System One Diagnostics detected specific flaws in the input:
${diagnostics.issues.map((issue) => `- ${issue}`).join("\n")}
Focus specifically on fixing these diagnostic flaws in your rewrite while maintaining the core intent.`;
  }

  const system = `You are an elite prompt engineer. Analyze the user's prompt and rewrite it into a production-grade, highly effective version.

${KIND_GUIDANCE[kind]}
${diagnosticContext}

You MUST return a JSON object with this exact schema:
{
  "optimized": "the full rewritten prompt text",
  "summary": "2-3 sentence explanation of what improved",
  "changes": ["bullet change 1", "bullet change 2", "bullet change 3"]
}`;

  const user = `Prompt type: ${kind}

--- ORIGINAL PROMPT ---
${prompt}
--- END ORIGINAL PROMPT ---`;

  return { system, user };
}

export function parseOptimizationResponse(text: string): {
  optimized: string;
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

  // 3. Attempt JSON parse
  try {
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed.optimized === "string") {
      return {
        optimized: parsed.optimized.trim(),
        summary: parsed.summary?.trim() || "Prompt structure, clarity, and constraints optimized.",
        changes: Array.isArray(parsed.changes)
          ? parsed.changes.map((c: unknown) => String(c).trim()).filter(Boolean)
          : ["Refined clarity and task specificity"],
      };
    }
  } catch {
    // If strict parse failed, attempt regex extraction for individual fields
    const optMatch = clean.match(/"optimized"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const sumMatch = clean.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    if (optMatch) {
      try {
        const optimized = JSON.parse(`"${optMatch[1]}"`);
        const summary = sumMatch ? JSON.parse(`"${sumMatch[1]}"`) : "Prompt optimized.";
        return {
          optimized,
          summary,
          changes: ["Extracted and optimized prompt constraints"],
        };
      } catch {
        // continue to fallback
      }
    }
  }

  // 4. Fallback: If model completely failed to format JSON, use the raw response as the optimized prompt
  return {
    optimized: trimmed.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, ""),
    summary: "Rewritten prompt generated directly by model.",
    changes: ["Enhanced instructions and structure"],
  };
}
