import { runDiagnostics } from "@/lib/decisions";
import { validateDomain } from "@/lib/validation";
import { resolveOptionalOpenrouterKey } from "@/lib/server/access";
import { readBody, routeError } from "@/lib/server/route";

export async function POST(req: Request) {
  try {
    const domain = validateDomain(await readBody(req));
    return Response.json(
      await runDiagnostics({
        prompt: domain.prompt,
        kind: domain.kind,
        openrouterKey: resolveOptionalOpenrouterKey(req),
        signal: req.signal,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
