import type { OptimizationMode, PromptKind } from "./types";

/** Words shown in the interface. Internal enum values never reach the screen. */
export const KIND_LABEL: Record<PromptKind, string> = {
  user: "User prompt",
  system: "System prompt",
  image: "Image prompt",
  video: "Video prompt",
};

/** The prompt type control already has a "Prompt type" legend, so the options stay short. */
export const KIND_SHORT: Record<PromptKind, string> = {
  user: "User",
  system: "System",
  image: "Image",
  video: "Video",
};

export const MODE_LABEL: Record<OptimizationMode, string> = {
  minimal: "Light edit",
  structured: "Restructure",
  creative: "Allow additions",
};
