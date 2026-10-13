import { optimizePrompt } from "@/lib/providers/chat";
import { validateDomain } from "@/lib/validation";
import { resolveKey } from "@/lib/server/access";
import { readBody, routeError } from "@/lib/server/route";

export async function POST(req: Request) {
  try {
    const domain = validateDomain(await readBody(req));
    const key = resolveKey(req, "deepseek");
    const diagnosticKey = domain.diagnosticSource === "local" ? undefined : resolveKey(req, domain.diagnosticSource);
    const result = await optimizePrompt({ ...domain, deepseekApiKey: key, diagnosticKey, signal: req.signal });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
