import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../validation";

const providers = {
  deepseek: { header: "x-deepseek-key", env: "DEEPSEEK_API_KEY" },
  openrouter: { header: "x-openrouter-key", env: "OPENROUTER_API_KEY" },
  typesafe: { header: "x-typesafe-key", env: "TYPESAFE_API_KEY" },
} as const;
export function resolveKey(
  req: Request,
  provider: keyof typeof providers,
): string {
  const config = providers[provider];
  const ownKey = req.headers.get(config.header)?.trim();
  if (ownKey) {
    if (ownKey.length > 512 || /[\r\n]/.test(ownKey))
      throw new AppError("Invalid provider key.");
    return ownKey;
  }
  const token = process.env.APP_ACCESS_TOKEN?.trim();
  const supplied = req.headers.get("x-app-access-token") || "";
  if (
    !token ||
    supplied.length > 512 ||
    !timingSafeEqual(
      createHash("sha256").update(token).digest(),
      createHash("sha256").update(supplied).digest(),
    )
  ) {
    throw new AppError(
      `Configure your ${provider} key or provide valid protected shared access.`,
      401,
    );
  }
  const shared = process.env[config.env]?.trim();
  if (!shared)
    throw new AppError(`${provider} is not configured for shared access.`, 401);
  return shared;
}
export function serverConfig() {
  const sharedAccess = Boolean(process.env.APP_ACCESS_TOKEN?.trim());
  return {
    sharedAccess,
    deepseek: sharedAccess && Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
    openrouter: sharedAccess && Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    typesafe: sharedAccess && Boolean(process.env.TYPESAFE_API_KEY?.trim()),
  };
}
const buckets = new Map<string, { count: number; reset: number }>();
export function throttle(req: Request, limit = 30, now = Date.now()) {
  for (const [key, bucket] of buckets)
    if (bucket.reset <= now) buckets.delete(key);
  const credential =
    req.headers.get("x-app-access-token") ||
    req.headers.get("x-deepseek-key") ||
    req.headers.get("x-openrouter-key") ||
    req.headers.get("x-typesafe-key") ||
    "anonymous";
  const key = createHash("sha256").update(credential).digest("hex");
  const bucket = buckets.get(key) || { count: 0, reset: now + 60000 };
  if (bucket.count >= limit || (!buckets.has(key) && buckets.size >= 1000))
    throw new AppError(
      "Per-instance request limit reached. Try again in one minute.",
      429,
    );
  bucket.count++;
  buckets.set(key, bucket);
}
