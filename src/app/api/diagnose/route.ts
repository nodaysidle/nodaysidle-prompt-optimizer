import { runJevDiagnostics } from "@/lib/jev";
import { validateDomain } from "@/lib/validation";
import { resolveKey } from "@/lib/server/access";
import { readBody, routeError } from "@/lib/server/route";
export async function POST(req: Request) {
  try {
    const domain = validateDomain(await readBody(req));
    const apiKey =
      domain.diagnosticSource === "local"
        ? undefined
        : resolveKey(req, domain.diagnosticSource);
    return Response.json(
      await runJevDiagnostics({
        ...domain,
        source: domain.diagnosticSource,
        apiKey,
        signal: req.signal,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
