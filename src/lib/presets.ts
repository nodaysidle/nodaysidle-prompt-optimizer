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
  if (!prompt.trim()) {
    return "The subject in the photo...";
  }
  return /^the subject (?:in|from) the photo\b/i.test(prompt.trim())
    ? prompt
    : `The subject in the photo. ${prompt}`;
}

export function toggleReferencePhotoInstruction(prompt: string): string {
  const trimmed = prompt.trim();
  if (/^the subject (?:in|from) the photo(?:\.{1,3}|:)?\s*$/i.test(trimmed)) {
    return "";
  }
  if (/^the subject (?:in|from) the photo(?:\.{1,3}|:)?\s*/i.test(trimmed)) {
    return trimmed.replace(/^the subject (?:in|from) the photo(?:\.{1,3}|:)?\s*/i, "").trim();
  }
  return trimmed ? `The subject in the photo. ${trimmed}` : "The subject in the photo...";
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
