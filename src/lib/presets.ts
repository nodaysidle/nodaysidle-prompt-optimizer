import type { EngineTarget } from "./types";
export function composePresets(prompt: string, target: EngineTarget, ratio: string, lens: string) {
  const clean = prompt.replace(/\s*--ar\s+\d+(?:\.\d+)?:\d+(?:\.\d+)?/gi, "")
    .replace(/(?:[,;]\s*|\s*\n)?aspect ratio\s+\d+(?:\.\d+)?:\d+(?:\.\d+)?/gi, "")
    .replace(/(?:[,;]\s*|\s*\n)?shot on\s+[^,;\n]+\s+lens/gi, "").replace(/^[,;\s]+|[,;\s]+$/g, "");
  return [clean, lens ? `Shot on ${lens} lens` : "", ratio ? target === "midjourney" ? `--ar ${ratio}` : `Aspect ratio ${ratio}` : ""].filter(Boolean).join("\n");
}
