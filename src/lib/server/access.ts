import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../validation";

const providers = {
  deepseek: { header: "x-deepseek-key", env: "DEEPSEEK_API_KEY" },
  openrouter: { header: "x-openrouter-key", env: "OPENROUTER_API_KEY" },
} as const;
type Provider = keyof typeof providers;

function ownKeyOf(req: Request, provider: Provider): string | undefined {
  const ownKey = req.headers.get(providers[provider].header)?.trim();
  if (!ownKey) return undefined;
  if (ownKey.length > 512 || /[\r\n]/.test(ownKey))
    throw new AppError("Invalid provider key.");
  return ownKey;
}

function hasSharedAccess(req: Request): boolean {
  const token = process.env.APP_ACCESS_TOKEN?.trim();
  const supplied = req.headers.get("x-app-access-token") || "";
  return Boolean(
    token &&
      supplied.length <= 512 &&
      timingSafeEqual(
        createHash("sha256").update(token).digest(),
        createHash("sha256").update(supplied).digest(),
      ),
  );
}

/**
 * The chat rewrite can run on either provider. Prefer the caller's own keys; the
 * server's keys are used only with a valid access token.
 */
export function resolveChatKeys(req: Request): {
  deepseekApiKey: string;
  openrouterApiKey?: string;
} {
  const deepseek = ownKeyOf(req, "deepseek");
  const openrouter = ownKeyOf(req, "openrouter");
  if (deepseek || openrouter) {
    return { deepseekApiKey: deepseek || openrouter!, openrouterApiKey: openrouter };
  }
  if (!hasSharedAccess(req))
    throw new AppError(
      "Add a DeepSeek or OpenRouter key in Settings, or provide valid protected shared access.",
      401,
    );
  const sharedDeepseek = process.env.DEEPSEEK_API_KEY?.trim();
  const sharedOpenrouter = process.env.OPENROUTER_API_KEY?.trim();
  if (!sharedDeepseek && !sharedOpenrouter)
    throw new AppError("No provider is configured for shared access.", 401);
  return {
    deepseekApiKey: sharedDeepseek || sharedOpenrouter!,
    openrouterApiKey: sharedOpenrouter,
  };
}

/** The OpenRouter key for diagnostics, if the caller is allowed one; otherwise rule-based diagnostics run. */
export function resolveOptionalOpenrouterKey(req: Request): string | undefined {
  const own = ownKeyOf(req, "openrouter");
  if (own) return own;
  if (!hasSharedAccess(req)) return undefined;
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

export function resolveKey(
  req: Request,
  provider: Provider,
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
  };
}
const MAX_BUCKETS = 1000;
const buckets = new Map<string, { count: number; reset: number }>();

/**
 * Who a request counts against. Never a value the caller picks, such as a key or token
 * header: that lets one client mint unlimited identities to dodge the limit, or fill the
 * table so that everyone else is turned away. Behind Vercel the edge sets these headers
 * itself, so the first address is the real client. On a host with no such proxy a caller
 * could set them, which is why this limit is a per-instance courtesy and not a quota.
 */
function clientId(req: Request): string {
  const header =
    req.headers.get("x-vercel-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for") ||
    "";
  return header.split(",")[0].trim().slice(0, 100) || "unknown";
}

export function throttle(req: Request, limit = 30, now = Date.now()) {
  for (const [key, bucket] of buckets)
    if (bucket.reset <= now) buckets.delete(key);
  const key = createHash("sha256").update(clientId(req)).digest("hex");
  // A full table drops the oldest entry. It never refuses a new client: refusing would
  // let someone who fills the table lock every other visitor out.
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  const bucket = buckets.get(key) || { count: 0, reset: now + 60000 };
  if (bucket.count >= limit)
    throw new AppError(
      "Per-instance request limit reached. Try again in one minute.",
      429,
    );
  bucket.count++;
  buckets.set(key, bucket);
}
