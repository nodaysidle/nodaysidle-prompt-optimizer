import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/lib/settings-context";
import { PromptWorkspace } from "@/components/prompt-workspace";
import { runHeuristicDiagnostics } from "@/lib/jev";

const result = { optimized: "Translate hello into French, concisely.", summary: "Clarified wording.", changes: ["Kept task"], assumptions: [], questions: [], warnings: [], qualityGate: { state: "unavailable", passed: false, source: "local", reason: "No external check selected." } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url) => url === "/api/config" ? Response.json({ sharedAccess: false, deepseek: false, openrouter: false, typesafe: false }) : Response.json(result)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function mount() { render(<SettingsProvider><PromptWorkspace /></SettingsProvider>); await act(async () => { await Promise.resolve(); }); }
describe("workspace regression state", () => {
  it("ignores late diagnostics after clear and immediately clears short/empty metrics", async () => {
    const pending = deferred<Response>(); const fetch = vi.fn(async (url) => url === "/api/config" ? Response.json({ sharedAccess: false }) : pending.promise); vi.stubGlobal("fetch", fetch);
    await mount(); fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "Translate hello into French." } });
    fireEvent.click(screen.getByRole("button", { name: "Recheck draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    await act(async () => pending.resolve(Response.json(runHeuristicDiagnostics("Translate hello into French.", "user"))));
    expect(screen.queryByText(/Local heuristic ·/)).toBeNull(); expect((screen.getByLabelText("Your draft") as HTMLTextAreaElement).value).toBe("");
  });
  it("aborts and blocks an old rewrite on draft changes even if mocked transport ignores abort", async () => {
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn(async (url) => url === "/api/config" ? Response.json({ sharedAccess: false }) : pending.promise));
    await mount(); fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "Original task" } }); fireEvent.click(screen.getByRole("button", { name: "Rewrite draft" }));
    fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "New task" } });
    await act(async () => pending.resolve(Response.json(result)));
    expect(screen.queryByLabelText("Candidate")).toBeNull(); expect((screen.getByLabelText("Your draft") as HTMLTextAreaElement).value).toBe("New task");
  });
  it("freezes original diff and marks edits stale, next draft has Undo", async () => {
    await mount(); fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "Translate hello into French." } }); fireEvent.click(screen.getByRole("button", { name: "Rewrite draft" }));
    await screen.findByDisplayValue(result.optimized);
    fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "Different live draft" } });
    expect(screen.getByTestId("frozen-original").textContent).toBe("Translate hello into French."); expect(screen.getByText("Stale or edited, review required")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Candidate"), { target: { value: "Edited candidate" } }); fireEvent.click(screen.getByRole("button", { name: "Use as next draft" }));
    expect((screen.getByLabelText("Your draft") as HTMLTextAreaElement).value).toBe("Edited candidate"); fireEvent.click(screen.getByRole("button", { name: "Undo replacement" })); expect((screen.getByLabelText("Your draft") as HTMLTextAreaElement).value).toBe("Different live draft");
  });
  it("examples replace with Undo and intended target", async () => {
    await mount(); fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "My original" } });
    fireEvent.change(screen.getByLabelText("Prompt type"), { target: { value: "video" } });
    fireEvent.change(screen.getByLabelText(/Example for/), { target: { value: "0" } });
    expect((screen.getByLabelText("Versioned target profile") as HTMLSelectElement).value).toBe("veo");
    fireEvent.click(screen.getByRole("button", { name: "Undo replacement" })); expect((screen.getByLabelText("Your draft") as HTMLTextAreaElement).value).toBe("My original");
  });
  it("example load triggers one debounced diagnostic, not an extra manual request", async () => {
    const fetch = vi.fn(async (url, init) => url === "/api/config" ? Response.json({ sharedAccess: false }) : Response.json(runHeuristicDiagnostics(JSON.parse(init.body).prompt, "user")));
    vi.stubGlobal("fetch", fetch); await mount(); vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText(/Example for/), { target: { value: "2" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(fetch.mock.calls.filter(([url]) => url === "/api/diagnose")).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => url === "/api/optimize")).toBe(false);
  });
  it("clipboard failures are shown", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await mount(); fireEvent.change(screen.getByLabelText("Your draft"), { target: { value: "My prompt" } }); fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() => expect(screen.getByText(/Clipboard unavailable/)).toBeTruthy());
  });
});
