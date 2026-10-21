import {
  ENGINE_TARGETS,
  MODES,
  PROMPT_KINDS,
  migrateModel,
} from "./types";
import { PROFILES } from "./profiles";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  name: string,
  required = true,
  max = 20000,
): string {
  if (!required && value === undefined) return "";
  if (typeof value !== "string") throw new AppError(`${name} must be text.`);
  if (value.length > max)
    throw new AppError(`${name} must be at most ${max} characters.`);
  if (required && !value.trim()) throw new AppError(`${name} is required.`);
  return value.trim();
}
export function enumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
  name: string,
): T[number] {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !options.includes(value))
    throw new AppError(`Unsupported ${name}. Choose ${options.join(", ")}.`);
  return value as T[number];
}
export function numberValue(
  value: unknown,
  min: number,
  max: number,
  name: string,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new AppError(`${name} must be between ${min} and ${max}.`);
  return value;
}
export function booleanValue(
  value: unknown,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    throw new AppError(`${name} must be boolean.`);
  return value;
}
export function stringList(value: unknown, name: string, max = 20): string[] {
  if (!Array.isArray(value) || value.length > max)
    throw new AppError(
      `${name} must be an array of at most ${max} text entries.`,
    );
  return value.map((v) => text(v, name, true, 2000));
}
export function validateDomain(value: unknown) {
  const body = record(value);
  const prompt = text(body.prompt, "Prompt");
  const kind = enumValue(body.kind, PROMPT_KINDS, "user", "prompt kind");
  const mode = enumValue(body.mode, MODES, "minimal", "optimization mode");
  const engineTarget = enumValue(
    body.engineTarget,
    ENGINE_TARGETS,
    "universal",
    "target profile",
  );
  if (!PROFILES[engineTarget].kinds.includes(kind))
    throw new AppError("Target profile is incompatible with this prompt kind.");
  // Older clients saved retired ids (deepseek-flash, deepseek-chat); accept and upgrade them.
  const model = migrateModel(body.model);
  return { body, prompt, kind, mode, engineTarget, model };
}
