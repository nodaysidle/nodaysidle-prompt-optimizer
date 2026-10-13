import { runPromptTest } from "@/lib/providers/deepseek";
import { AppError, numberValue, text, validateDomain } from "@/lib/validation";
import { resolveKey } from "@/lib/server/access";
import { readBody, routeError } from "@/lib/server/route";
export async function POST(req: Request) {
  try {
    const domain = validateDomain(await readBody(req));
    if (domain.kind === "image" || domain.kind === "video")
      throw new AppError(
        "Visual profiles support text review only; no image/video rendering or text A/B execution.",
      );
    const testInput = text(domain.body.testInput, "Scenario", false);
    const candidate =
      domain.body.candidate === undefined
        ? undefined
        : text(domain.body.candidate, "Candidate");
    const temperature = numberValue(
      domain.body.temperature,
      0,
      2,
      "Temperature",
      0.3,
    );
    const maxTokens = numberValue(
      domain.body.maxTokens,
      64,
      4096,
      "Output tokens",
      1024,
    );
    if (!Number.isInteger(maxTokens))
      throw new AppError("Output tokens must be an integer.");
    const apiKey = resolveKey(req, "deepseek");
    const config = {
      model: domain.model,
      kind: domain.kind,
      testInput,
      temperature,
      maxTokens,
      thinking: "disabled",
    };
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.signal.addEventListener("abort", abort, { once: true });
    if (req.signal.aborted) abort();
    try {
      const params = { ...config, apiKey, signal: controller.signal };
      const [before, after] = await Promise.all([
        runPromptTest({ ...params, prompt: domain.prompt }),
        candidate
          ? runPromptTest({ ...params, prompt: candidate })
          : Promise.resolve(undefined),
      ]);
      return Response.json(
        { before, ...(after ? { after } : {}), config },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      abort();
      throw error;
    } finally {
      req.signal.removeEventListener("abort", abort);
    }
  } catch (error) {
    return routeError(error);
  }
}
