import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, useSettings } from "@/lib/settings-context";
import { SettingsContent } from "@/components/settings-panel";

function HydratedSettings() {
  const { hydrated } = useSettings();
  return hydrated ? <SettingsContent /> : null;
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        sharedAccess: false,
        deepseek: false,
        openrouter: false,
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount() {
  render(
    <SettingsProvider>
      <HydratedSettings />
    </SettingsProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}
describe("explicit legacy credential choices", () => {
  it("imports only into session memory, hides values in password fields and sends no request", async () => {
    const original = JSON.stringify({
      deepseekApiKey: "fixture-saved-key",
      appAccessToken: "fixture-not-imported",
      rememberKeys: true,
      deepseekModel: "deepseek-reasoner",
    });
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    await mount();
    expect(screen.getByText("Legacy saved credentials detected")).toBeTruthy();
    expect(
      (screen.getByLabelText("DeepSeek API key") as HTMLInputElement).value,
    ).toBe("");
    const beforeRequests = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", {
        name: "Import saved credentials for this session",
      }),
    );
    expect(vi.mocked(fetch).mock.calls.length).toBe(beforeRequests);
    const key = screen.getByLabelText("DeepSeek API key") as HTMLInputElement;
    expect(key.value).toBe("fixture-saved-key");
    expect(key.type).toBe("password");
    expect(screen.queryByText("fixture-saved-key")).toBeNull();
    expect(
      (
        screen.getByLabelText(
          "Protected shared owner token (session only)",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        screen.getByLabelText(
          "Remember provider keys in this browser (plaintext)",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(localStorage.getItem("prompt-optimizer-settings-v3")).toBeNull();
    expect(
      (
        screen.getByLabelText(
          "Read my draft automatically as I type",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(localStorage.getItem("prompt-optimizer-settings-v3")).not.toContain(
      "fixture-saved-key",
    );
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
  });
  it("explicitly forgets only the legacy copy and leaves current session credentials", async () => {
    localStorage.setItem(
      "prompt-optimizer-settings-v2",
      JSON.stringify({ deepseekApiKey: "fixture-key" }),
    );
    await mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Import saved credentials for this session",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Forget legacy credentials" }),
    );
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBeNull();
    expect(
      (screen.getByLabelText("DeepSeek API key") as HTMLInputElement).value,
    ).toBe("fixture-key");
    expect(screen.queryByText("Legacy saved credentials detected")).toBeNull();
  });
  it("keeps malformed legacy data recoverable with an explicit forget control", async () => {
    localStorage.setItem(
      "prompt-optimizer-settings-v2",
      "{recoverable fixture",
    );
    await mount();
    expect(
      (
        screen.getByRole("button", {
          name: "Import saved credentials for this session",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/remain unchanged and recoverable/)).toBeTruthy();
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(
      "{recoverable fixture",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Forget legacy credentials" }),
    );
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBeNull();
  });
  it("surfaces bootstrap storage errors", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("Browser storage blocked");
    });
    await mount();
    expect(screen.getByRole("status").textContent).toContain(
      "Browser storage blocked",
    );
  });
  it("surfaces explicit forget failures without claiming deletion", async () => {
    const original = JSON.stringify({ deepseekApiKey: "fixture-key" });
    localStorage.setItem("prompt-optimizer-settings-v2", original);
    await mount();
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Forget legacy credentials" }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "could not be removed",
    );
    expect(localStorage.getItem("prompt-optimizer-settings-v2")).toBe(original);
    expect(screen.getByText("Legacy saved credentials detected")).toBeTruthy();
  });
});
