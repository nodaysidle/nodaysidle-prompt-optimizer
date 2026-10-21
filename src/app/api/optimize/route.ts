import { optimizePrompt, type Stage } from "@/lib/providers/chat";
import { validateDomain } from "@/lib/validation";
import { resolveChatKeys } from "@/lib/server/access";
import { readBody, routeError } from "@/lib/server/route";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Plain JSON by default. A client that sends `Accept: application/x-ndjson` also gets
 * one line per real pipeline stage as it starts, then a final `result` or `error` line.
 */
export async function POST(req: Request) {
  try {
    const domain = validateDomain(await readBody(req));
    const keys = resolveChatKeys(req);
    const run = (onStage?: (stage: Stage) => void) =>
      optimizePrompt({
        prompt: domain.prompt,
        kind: domain.kind,
        engineTarget: domain.engineTarget,
        mode: domain.mode,
        model: domain.model,
        deepseekApiKey: keys.deepseekApiKey,
        openrouterApiKey: keys.openrouterApiKey,
        signal: req.signal,
        onStage,
      });

    if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
      return Response.json(await run(), { headers: NO_STORE });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        try {
          send({ result: await run((stage) => send({ stage })) });
        } catch (error) {
          const failure = await routeError(error).json();
          send({ error: failure.error, requestId: failure.requestId });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (error) {
    return routeError(error);
  }
}
