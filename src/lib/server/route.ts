import { AppError } from "../validation";
import { ProviderError } from "../providers/completion";
import { throttle } from "./access";

export async function readBody(req: Request): Promise<unknown> {
  throttle(req);
  if (!req.body) throw new AppError("JSON body is required.");
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let cancelled: AppError | undefined;
  const cancel = (error: AppError) => {
    cancelled = error;
    void reader.cancel().catch(() => { cancelled = new AppError("Request stream could not be cancelled.", error.status); });
  };
  const abort = () => cancel(new AppError("Request cancelled.", 499));
  req.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => cancel(new AppError("Request body deadline exceeded.", 408)), 15000);
  if (req.signal.aborted) abort();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (cancelled) throw cancelled;
      if (done) break;
      size += value.byteLength;
      if (size > 150000) { await reader.cancel(); throw new AppError("Request body is too large."); }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (cancelled) throw cancelled;
    if (error instanceof AppError) throw error;
    throw new AppError("Malformed JSON body.");
  } finally { clearTimeout(timer); req.signal.removeEventListener("abort", abort); reader.releaseLock(); }
}
export function routeError(error: unknown) {
  const id = crypto.randomUUID();
  const status = error instanceof AppError || error instanceof ProviderError ? error.status : 500;
  const message = error instanceof AppError || error instanceof ProviderError ? error.message : "Request failed. Try again.";
  return Response.json({ error: message, requestId: id }, { status, headers: { "Cache-Control": "no-store" } });
}
