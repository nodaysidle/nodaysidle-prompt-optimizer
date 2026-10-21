import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/lib/settings-context";
import { PromptWorkspace } from "@/components/prompt-workspace";
import { runHeuristicDiagnostics } from "@/lib/decisions";

const result = {
  optimized: "Translate hello into French, concisely.",
  summary: "Clarified wording.",
  changes: ["Kept task"],
  assumptions: [],
  warnings: [],
  unresolvedQuestions: [],
};
const ORIGINAL = "Translate hello into French.";

/** The optimize endpoint's stream: one line per stage, then the result. */
function ndjson(...events: unknown[]) {
  return new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(""), {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function route(handlers: Record<string, (init: RequestInit) => Response | Promise<Response>>) {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === "/api/config")
      return Response.json({ sharedAccess: false, deepseek: false, openrouter: false });
    const handler = handlers[url];
    if (!handler) throw new Error(`unexpected request to ${url}`);
    return handler(init);
  });
}
const OK_RUN = () => ndjson({ stage: "diagnose" }, { stage: "rewrite" }, { stage: "verify" }, { result });

beforeEach(() => {
  localStorage.clear();
  // A remembered key, so the run button is available; diagnostics off unless a test turns them on.
  localStorage.setItem(
    "prompt-optimizer-settings-v3",
    JSON.stringify({ rememberKeys: true, deepseekApiKey: "fixture-key", autoDiagnose: false }),
  );
  vi.stubGlobal("fetch", route({ "/api/optimize": OK_RUN }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function mount() {
  render(
    <SettingsProvider>
      <PromptWorkspace />
    </SettingsProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}
const draftBox = () => screen.getByLabelText("Draft") as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(draftBox(), { target: { value } });
const run = () => fireEvent.click(screen.getByRole("button", { name: "Optimize prompt" }));

describe("running the optimizer", () => {
  it("shows the result as an edit to the submitted text, with the final prompt built from it", async () => {
    await mount();
    type(ORIGINAL);
    run();
    await screen.findByText("Edit 1 of 1");
    expect(screen.getByLabelText("Edit 1 of 1").textContent).toContain(ORIGINAL);
    expect((screen.getByLabelText("Final prompt") as HTMLTextAreaElement).value).toBe(
      result.optimized,
    );
  });

  it("reverting an edit puts the original text back, and keeping it restores the rewrite", async () => {
    await mount();
    type(ORIGINAL);
    run();
    await screen.findByText("Edit 1 of 1");
    const final = () => (screen.getByLabelText("Final prompt") as HTMLTextAreaElement).value;

    fireEvent.click(screen.getByRole("button", { name: "Revert this edit" }));
    expect(final().trim()).toBe(ORIGINAL);
    fireEvent.click(screen.getByRole("button", { name: "Keep this edit" }));
    expect(final()).toBe(result.optimized);
  });

  it("lights follow the stages the server reports, and go out when the result lands", async () => {
    const gate = deferred<void>();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('{"stage":"diagnose"}\n'));
        await gate.promise;
        controller.enqueue(encoder.encode(`${JSON.stringify({ result })}\n`));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", route({ "/api/optimize": () => new Response(body) }));
    await mount();
    type(ORIGINAL);
    run();
    await screen.findByText("Reading your prompt");
    expect(document.querySelectorAll('.lamp[data-on="true"]')).toHaveLength(2);
    await act(async () => gate.resolve());
    await screen.findByText("Edit 1 of 1");
    expect(document.querySelectorAll('.lamp[data-on="true"]')).toHaveLength(0);
  });

  it("shows a clear message and the request id when the run fails, and can run again", async () => {
    vi.stubGlobal(
      "fetch",
      route({
        "/api/optimize": () => ndjson({ stage: "rewrite" }, { error: "Provider deadline exceeded.", requestId: "req-1" }),
      }),
    );
    await mount();
    type(ORIGINAL);
    run();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Provider deadline exceeded.");
    expect(alert.textContent).toContain("req-1");
    expect(screen.getByRole("button", { name: "Run again" })).toBeTruthy();
  });

  it("cannot run without a key, and says how to add one", async () => {
    localStorage.clear();
    await mount();
    type(ORIGINAL);
    expect((screen.getByRole("button", { name: "Optimize prompt" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Add a DeepSeek or OpenRouter key/)).toBeTruthy();
  });

  it("states plainly when the original was kept and offers the rejected draft", async () => {
    vi.stubGlobal(
      "fetch",
      route({
        "/api/optimize": () =>
          ndjson({
            result: {
              ...result,
              optimized: ORIGINAL,
              rejectedDraft: { optimized: result.optimized, reason: "marginal", problems: ["only 20% likely to work better"] },
            },
          }),
      }),
    );
    await mount();
    type(ORIGINAL);
    run();
    await screen.findByText(/Original kept\./);
    expect(screen.getByText(/only 20% likely to work better/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review the rejected draft anyway" }));
    await screen.findByText("Edit 1 of 1");
  });
});

describe("state that must not leak between runs", () => {
  it("aborts and blocks an old run when the draft changes, even if the transport ignores abort", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", route({ "/api/optimize": () => pending.promise }));
    await mount();
    type("Original task");
    run();
    type("New task");
    await act(async () => pending.resolve(OK_RUN()));
    expect(screen.queryByText(/Edit 1 of/)).toBeNull();
    expect(draftBox().value).toBe("New task");
  });

  it("keeps the redline bound to what was submitted when the draft changes afterwards", async () => {
    await mount();
    type(ORIGINAL);
    run();
    await screen.findByText("Edit 1 of 1");
    type("Different live draft");
    expect(screen.getByText(/You changed the draft or the settings/)).toBeTruthy();
    expect(screen.getByLabelText("Edit 1 of 1").textContent).toContain(ORIGINAL);
    expect(screen.queryByText("Different live draft", { selector: ".edit-text" })).toBeNull();
  });

  it("use as next draft replaces the draft and Undo brings the previous one back", async () => {
    await mount();
    type(ORIGINAL);
    run();
    await screen.findByText("Edit 1 of 1");
    type("Different live draft");
    fireEvent.change(screen.getByLabelText("Final prompt"), { target: { value: "Edited result" } });
    fireEvent.click(screen.getByRole("button", { name: "Use as next draft" }));
    expect(draftBox().value).toBe("Edited result");
    fireEvent.click(screen.getByRole("button", { name: "Undo replacement" }));
    expect(draftBox().value).toBe("Different live draft");
  });

  it("warns when the final text drops something the user wrote in quotes", async () => {
    await mount();
    type('Say "good morning" to the team.');
    run();
    await screen.findByText("Edit 1 of 1");
    fireEvent.change(screen.getByLabelText("Final prompt"), { target: { value: "Greet the team." } });
    const alert = await screen.findByText(/no longer matches what you wrote/);
    expect(alert.closest('[role="alert"]')?.textContent).toContain("good morning");
  });
});

describe("the draft side", () => {
  it("ignores late diagnostics after the draft is cleared", async () => {
    localStorage.setItem(
      "prompt-optimizer-settings-v3",
      JSON.stringify({ rememberKeys: true, deepseekApiKey: "fixture-key", autoDiagnose: false }),
    );
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", route({ "/api/diagnose": () => pending.promise }));
    await mount();
    type(ORIGINAL);
    fireEvent.click(screen.getByRole("button", { name: "Read again" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    await act(async () => pending.resolve(Response.json(runHeuristicDiagnostics(ORIGINAL, "user"))));
    expect(screen.queryByText(/Rule-based estimate/)).toBeNull();
    expect(draftBox().value).toBe("");
  });

  it("examples replace the draft with Undo and pick the intended target", async () => {
    await mount();
    type("My original");
    fireEvent.click(screen.getByRole("button", { name: "Video prompt" }));
    fireEvent.click(screen.getByText("Examples and visual options"));
    fireEvent.change(screen.getByLabelText(/Example for/), { target: { value: "0" } });
    expect((screen.getByLabelText("Writing for") as HTMLSelectElement).value).toBe("veo");
    fireEvent.click(screen.getByRole("button", { name: "Undo replacement" }));
    expect(draftBox().value).toBe("My original");
  });

  it("an example load triggers one debounced read, never a run", async () => {
    localStorage.setItem(
      "prompt-optimizer-settings-v3",
      JSON.stringify({ rememberKeys: true, deepseekApiKey: "fixture-key", autoDiagnose: true }),
    );
    const fetch = route({
      "/api/diagnose": (init) =>
        Response.json(runHeuristicDiagnostics(JSON.parse(String(init.body)).prompt, "user")),
    });
    vi.stubGlobal("fetch", fetch);
    await mount();
    vi.useFakeTimers();
    fireEvent.click(screen.getByText("Examples and visual options"));
    fireEvent.change(screen.getByLabelText(/Example for/), { target: { value: "2" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(fetch.mock.calls.filter(([url]) => url === "/api/diagnose")).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => url === "/api/optimize")).toBe(false);
  });

  it("shows clipboard failures", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await mount();
    type("My prompt");
    fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() => expect(screen.getByText(/clipboard is unavailable/i)).toBeTruthy());
  });

  it("uses no em dashes in any visible text", async () => {
    await mount();
    expect(document.body.textContent).not.toContain("—");
  });
});
