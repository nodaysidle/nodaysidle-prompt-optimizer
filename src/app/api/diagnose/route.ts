import { runDiagnostics } from "@/lib/decisions";
import { validateDomain } from "@/lib/validation";
import {
  resolveDecisionOrder,
  resolveOptionalMouseKey,
  resolveOptionalOpenrouterKey,
  resolveOptionalTypesafeKey,
} from "@/lib/server/access";
import { readBody, routeError } from "@/lib/server/route";

export async function POST(req: Request) {
  try {
    const domain = validateDomain(await readBody(req));
    return Response.json(
      await runDiagnostics({
        prompt: domain.prompt,
        kind: domain.kind,
        typesafeKey: resolveOptionalTypesafeKey(req),
        mouseKey: resolveOptionalMouseKey(req),
        openrouterKey: resolveOptionalOpenrouterKey(req),
        order: resolveDecisionOrder(),
        signal: req.signal,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
