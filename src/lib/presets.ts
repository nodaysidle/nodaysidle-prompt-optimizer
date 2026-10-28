import type { EngineTarget } from "./types";
export function parsePresets(prompt: string): { ratio: string; lens: string } {
  const ratios = [
    ...prompt.matchAll(
      /(?:--ar\s+|\baspect ratio\s+)(\d+(?:\.\d+)?:\d+(?:\.\d+)?)/gi,
    ),
  ];
  const lenses = [...prompt.matchAll(/\bshot on\s+([^,;\n]+?)\s+lens\b/gi)];
  return {
    ratio: ratios.at(-1)?.[1] || "",
    lens: lenses.at(-1)?.[1].trim() || "",
  };
}
export function addReferencePhotoInstruction(prompt: string): string {
  return /^the subject (?:in|from) the photo\b/i.test(prompt.trim())
    ? prompt
    : `The subject in the photo. ${prompt}`;
}
export function composePresets(
  prompt: string,
  _target: EngineTarget,
  ratio: string,
  lens: string,
) {
  const clean = prompt
    .replace(/\s*--ar\s+\d+(?:\.\d+)?:\d+(?:\.\d+)?/gi, "")
    .replace(
      /(?:[,;]\s*|\s*\n)?aspect ratio\s+\d+(?:\.\d+)?:\d+(?:\.\d+)?/gi,
      "",
    )
    .replace(/(?:[,;]\s*|\s*\n)?shot on\s+[^,;\n]+\s+lens/gi, "")
    .replace(/^[,;\s]+|[,;\s]+$/g, "");
  return [
    clean,
    lens ? `Shot on ${lens} lens` : "",
    ratio ? `Aspect ratio ${ratio}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
