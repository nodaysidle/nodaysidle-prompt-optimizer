import { expect, test, type Page } from "@playwright/test";
const candidate = {
  optimized: "Translate hello into French, concisely.",
  summary: "Kept the task.",
  changes: ["Clarified wording"],
  assumptions: [],
  questions: ["Should the register be formal?"],
  warnings: [],
  qualityGate: {
    state: "unavailable",
    source: "local",
    passed: false,
    reason: "No external preservation check.",
  },
};
async function mock(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const body =
      route.request().method() === "POST" ? route.request().postDataJSON() : {};
    let json: unknown = {};
    if (url.endsWith("/config"))
      json = {
        sharedAccess: true,
        deepseek: true,
        openrouter: true,
        typesafe: true,
      };
    if (url.endsWith("/diagnose"))
      json = {
        source: "local",
        clarityScore: 2,
        clarityLabel: "Clear",
        injectionRisk: 0,
        strengths: ["Clear task"],
        findings: [
          {
            title: "Supply context",
            why: "One important fact is not supplied.",
            question: "Which audience?",
          },
        ],
      };
    if (url.endsWith("/optimize"))
      json = {
        ...candidate,
        ...(body.engineTarget === "midjourney"
          ? { negativePrompt: "watermark" }
          : {}),
      };
    if (url.endsWith("/test-run"))
      json = {
        before: {
          content: "Bonjour",
          model: body.model,
          elapsedMs: 20,
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        },
        ...(body.candidate
          ? {
              after: { content: "Bonjour !", model: body.model, elapsedMs: 25 },
            }
          : {}),
        config: {
          model: body.model,
          kind: body.kind,
          testInput: body.testInput || "",
          temperature: body.temperature || 0.3,
          maxTokens: body.maxTokens || 64,
          thinking: "disabled",
        },
      };
    await route.fulfill({ json });
  });
}
test("editor, settings, diagnostics, candidate, A/B, history and keyboard dialog workflow", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mock(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Prompt workbench" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Protected shared access requires owner token", {
        exact: false,
      })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("DeepSeek API key", { exact: true })
    .fill("mock-only-key");
  await dialog
    .getByRole("button", { name: "Test deepseek", exact: true })
    .click();
  await expect(
    dialog.getByText("Tested successfully", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Protected shared owner token (session only)")
    .fill("mock-owner");
  await dialog.getByRole("button", { name: "Save settings" }).click();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "mock-only-key",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "mock-owner",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.getByLabel("Your draft").fill("Translate hello into French.");
  await page.getByRole("button", { name: "Recheck draft" }).click();
  await page.getByText("Rubric details and strengths", { exact: true }).click();
  await expect(page.getByText("Clear task", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Answer: Which audience?" }).click();
  await page.getByLabel("Which audience?").fill("French learners");
  await page.getByRole("button", { name: "Add my context to draft" }).click();
  await expect(page.getByLabel("Your draft")).toHaveValue(/French learners/);
  await page.getByRole("button", { name: "Undo replacement" }).click();
  await expect(page.getByLabel("Your draft")).toHaveValue(
    "Translate hello into French.",
  );
  await page.getByLabel("Optimization mode").selectOption("creative");
  await expect(
    page.getByText(/Optional creative expansion, with assumptions/),
  ).toBeVisible();
  await page.getByLabel("Optimization mode").selectOption("structured");
  await page.getByRole("button", { name: "Rewrite draft" }).click();
  await expect(page.getByLabel("Candidate", { exact: true })).toHaveValue(
    candidate.optimized,
  );
  await page
    .getByText("Frozen original and configuration", { exact: true })
    .click();
  await expect(page.getByTestId("frozen-original")).toHaveText(
    "Translate hello into French.",
  );
  await page.getByText(/^Preservation and provider record/).click();
  await expect(page.getByText(/local: unavailable/)).toBeVisible();
  await page.getByRole("button", { name: "Copy candidate" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    candidate.optimized,
  );
  await page.getByRole("button", { name: "Word diff", exact: true }).click();
  await expect(page.getByText("Word-by-word diff")).toBeVisible();
  await page.getByRole("button", { name: "Compare text outputs" }).click();
  const evaluation = page.getByRole("dialog", {
    name: "Paired text evaluation",
  });
  await expect(evaluation).toBeVisible();
  await evaluation
    .getByLabel("Identical scenario data for both prompts")
    .fill("A friendly greeting");
  await evaluation
    .getByRole("button", { name: "Run paired text evaluation" })
    .click();
  await expect(
    evaluation.getByRole("heading", { name: "Before output" }),
  ).toBeVisible();
  await expect(
    evaluation.getByRole("heading", { name: "After output" }),
  ).toBeVisible();
  await evaluation.getByRole("button", { name: "Copy before output" }).click();
  await evaluation.getByRole("button", { name: "Copy after output" }).click();
  await evaluation.getByLabel("Temperature").fill("0.5");
  await expect(
    evaluation.getByRole("heading", { name: "Before output" }),
  ).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Candidate", { exact: true }).fill("Edited candidate");
  await expect(
    page.getByText("Stale or edited, review required"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use as next draft" }).click();
  await expect(page.getByLabel("Your draft")).toHaveValue("Edited candidate");
  await page.getByRole("button", { name: "Undo replacement" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("dialog", { name: "History" });
  await history.getByRole("button", { name: "Favorite", exact: true }).click();
  await history.getByRole("button", { name: "Favorites only" }).click();
  await history.getByRole("button", { name: "Load saved prompt" }).focus();
  await page.keyboard.press("Enter");
  await expect(history).not.toBeVisible();
  await expect(page.getByLabel("Optimization mode")).toHaveValue("structured");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await dialog
    .getByLabel("Remember provider keys in this browser (plaintext)")
    .check();
  await dialog.getByRole("button", { name: "Save settings" }).click();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toContain(
    "mock-only-key",
  );
  await dialog
    .getByText("Advanced diagnostics and privacy", { exact: true })
    .click();
  await dialog
    .getByLabel("OpenRouter API key", { exact: true })
    .fill("mock-openrouter");
  await dialog.getByRole("button", { name: "Test openrouter" }).click();
  await expect(
    dialog.getByText("Tested successfully", { exact: true }).last(),
  ).toBeVisible();
  await dialog
    .getByLabel("TypeSafe API key", { exact: true })
    .fill("mock-typesafe");
  await dialog.getByRole("button", { name: "Test typesafe" }).click();
  await dialog
    .getByLabel("Diagnostic provider (explicit data-sharing choice)")
    .selectOption("openrouter");
  await dialog.getByLabel(/Allow app-server heuristic fallback/).check();
  await dialog.getByLabel(/Automatically diagnose/).uncheck();
  await dialog
    .getByLabel("Rewrite and evaluation model")
    .selectOption("deepseek-v4-pro");
  await dialog.getByRole("button", { name: "Save settings" }).click();
  await dialog.getByRole("button", { name: "Forget all credentials" }).click();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "mock-only-key",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Test draft text" }).click();
  const single = page.getByRole("dialog", { name: "Text test" });
  await single.getByRole("button", { name: "Run single text test" }).click();
  await expect(
    single.getByRole("heading", { name: "Before output" }),
  ).toBeVisible();
  await expect(
    single.getByRole("heading", { name: "After output" }),
  ).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await history.getByLabel("Search history").fill("does not match");
  await expect(history.getByText("No matching saved prompts.")).toBeVisible();
  await history.getByLabel("Search history").fill("");
  await history.getByRole("button", { name: "Copy saved candidate" }).click();
  await history.getByRole("button", { name: "Unfavorite" }).click();
  await history.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(history.getByText("No matching saved prompts.")).toBeVisible();
  await history.getByRole("button", { name: "Close History" }).click();
  await page.getByRole("button", { name: "Rewrite draft" }).click();
  await expect(page.getByLabel("Candidate", { exact: true })).toHaveValue(
    candidate.optimized,
  );
  await page.getByRole("button", { name: "History", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "Clear history" }).click();
  await expect(history.getByText("No matching saved prompts.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "/tmp/opencode/optimizer-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("visual profile controls, examples Undo, replacement presets, narrow overflow and focus trap", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Your draft").fill("My original bird");
  await page.getByLabel("Prompt type", { exact: true }).selectOption("video");
  await page.getByText("Examples and visual controls", { exact: true }).click();
  await page.getByLabel(/Example for/).selectOption("0");
  await expect(page.getByLabel("Versioned target profile")).toHaveValue("veo");
  await page.getByRole("button", { name: "Undo replacement" }).click();
  await expect(page.getByLabel("Your draft")).toHaveValue("My original bird");
  await page.getByLabel("Prompt type", { exact: true }).selectOption("image");
  await page.getByLabel("Versioned target profile").selectOption("midjourney");
  await page.getByLabel("One aspect ratio").selectOption("16:9");
  await page.getByLabel("One aspect ratio").selectOption("1:1");
  await page.getByLabel("One lens").selectOption("35mm");
  await page.getByLabel("One lens").selectOption("85mm");
  await expect(page.getByLabel("Your draft")).toHaveValue(
    "My original bird\nShot on 85mm lens\n--ar 1:1",
  );
  await page
    .getByLabel("Your draft")
    .fill("My blue bird\nShot on 85mm lens\n--ar 1:1");
  await expect(page.getByLabel("One aspect ratio")).toHaveValue("1:1");
  await expect(page.getByLabel("One lens")).toHaveValue("85mm");
  await page.getByLabel("One lens").selectOption("35mm");
  await expect(page.getByLabel("Your draft")).toHaveValue(
    "My blue bird\nShot on 35mm lens\n--ar 1:1",
  );
  await page.getByRole("button", { name: "Rewrite draft" }).click();
  await expect(
    page.getByRole("button", { name: "Compare text outputs" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Copy negative prompt" }).click();
  await expect(page.getByText("Copied.", { exact: true })).toBeVisible();
  await page
    .getByText("Profile compatibility and sources", { exact: true })
    .click();
  await expect(page.getByText(/Text review only. No image/)).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "Forget all credentials" }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest("dialog")),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Add reference-photo instruction" })
    .click();
  await expect(page.getByLabel("Your draft")).toHaveValue(
    /^The subject in the photo/,
  );
  const referenced = await page.getByLabel("Your draft").inputValue();
  await page
    .getByRole("button", { name: "Add reference-photo instruction" })
    .click();
  await expect(page.getByLabel("Your draft")).toHaveValue(referenced);
  await page.getByLabel("One aspect ratio").selectOption("");
  await page.getByLabel("One lens").selectOption("");
  await page.getByLabel("Versioned target profile").selectOption("flux");
  await expect(
    page.getByText(/FLUX.2 does not support negative prompts/),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/opencode/optimizer-narrow.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("measured text contrast, focus indicator, empty error state and no input placeholders", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  const ratios = await page.evaluate(() => {
    const luminance = (hex: string) => {
      const values = hex
        .replace("#", "")
        .match(/.{2}/g)!
        .map((v) => parseInt(v, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const style = getComputedStyle(document.documentElement);
    const value = (key: string) => style.getPropertyValue(key).trim();
    const ratio = (a: string, b: string) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) /
      (Math.min(luminance(a), luminance(b)) + 0.05);
    return {
      body: ratio(value("--foreground"), value("--background")),
      muted: ratio(value("--muted-fg"), value("--surface-muted")),
      primary: ratio(value("--accent-foreground"), value("--accent")),
      hover: ratio(value("--accent-foreground"), value("--accent-strong")),
      links: ratio(value("--accent"), value("--surface")),
    };
  });
  for (const ratio of Object.values(ratios))
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  console.log("Measured contrast ratios:", ratios);
  await expect(page.locator("[placeholder]")).toHaveCount(0);
  await page.getByLabel("Your draft").focus();
  expect(
    await page
      .getByLabel("Your draft")
      .evaluate((element) => getComputedStyle(element).outlineWidth),
  ).not.toBe("0px");
  await page.route("**/api/optimize", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Provider unavailable. Retry later." },
    }),
  );
  await page.getByLabel("Your draft").fill("A test prompt");
  await page.getByRole("button", { name: "Rewrite draft" }).click();
  await expect(
    page.getByText("Provider unavailable. Retry later."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear draft" }).click();
  await expect(page.getByLabel("Your draft")).toHaveValue("");
  await expect(page.getByText("No rewrite yet")).toBeVisible();
});
test("legacy credentials require explicit session import and remembering, with preserved saved copies", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  const original = JSON.stringify({
    deepseekApiKey: "fixture-legacy-deepseek",
    openrouterApiKey: "fixture-legacy-openrouter",
    appAccessToken: "fixture-owner-never-import",
    diagnosticSource: "openrouter",
    rememberKeys: true,
    deepseekModel: "deepseek-reasoner",
  });
  await page.evaluate(
    (value) => localStorage.setItem("prompt-optimizer-settings-v2", value),
    original,
  );
  await page.reload();
  await expect(page.getByText(/deepseek-v4-pro/).first()).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBe(original);
  await page.getByLabel("Your draft").fill("Existing private fixture draft");
  await page.getByRole("button", { name: "Recheck draft" }).click();
  await expect(
    page.getByRole("button", { name: "Answer: Which audience?" }),
  ).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settings.getByText("Legacy saved credentials detected"),
  ).toBeVisible();
  await expect(
    settings.getByLabel("DeepSeek API key", { exact: true }),
  ).toHaveValue("");
  await page.clock.install();
  await settings
    .getByRole("button", { name: "Import saved credentials for this session" })
    .click();
  await page.clock.runFor(700);
  await expect(
    settings.getByLabel("DeepSeek API key", { exact: true }),
  ).toHaveValue("fixture-legacy-deepseek");
  await expect(
    settings.getByLabel("DeepSeek API key", { exact: true }),
  ).toHaveAttribute("type", "password");
  await expect(
    settings.getByLabel("Protected shared owner token (session only)"),
  ).toHaveValue("");
  await expect(
    settings.getByLabel("Remember provider keys in this browser (plaintext)"),
  ).not.toBeChecked();
  expect(await settings.innerText()).not.toContain("fixture-legacy-deepseek");
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v3"),
    ),
  ).toBeNull();
  await settings
    .getByText("Advanced diagnostics and privacy", { exact: true })
    .click();
  await expect(
    settings.getByLabel("Diagnostic provider (explicit data-sharing choice)"),
  ).toHaveValue("local");
  await expect(
    settings.getByRole("option", {
      name: "App-server heuristics, no AI-provider transmission",
    }),
  ).toHaveCount(1);
  await settings.getByRole("button", { name: "Save settings" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v3"),
    ),
  ).not.toContain("fixture-legacy-deepseek");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBe(original);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText(/deepseek-v4-pro/).first()).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    settings.getByLabel("DeepSeek API key", { exact: true }),
  ).toHaveValue("");
  await settings
    .getByRole("button", { name: "Import saved credentials for this session" })
    .click();
  await settings
    .getByLabel("Remember provider keys in this browser (plaintext)")
    .check();
  await settings.getByRole("button", { name: "Save settings" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v3"),
    ),
  ).toContain("fixture-legacy-deepseek");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBe(original);
  await settings
    .getByRole("button", { name: "Forget legacy credentials" })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBeNull();
  await expect(
    settings.getByLabel("DeepSeek API key", { exact: true }),
  ).toHaveValue("fixture-legacy-deepseek");
  await settings
    .getByRole("button", { name: "Forget all credentials" })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v3"),
    ),
  ).toBeNull();
});
test("malformed legacy settings remain recoverable and deletion failures are surfaced", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "prompt-optimizer-settings-v2",
      "{recoverable fixture",
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(
    settings.getByRole("button", {
      name: "Import saved credentials for this session",
    }),
  ).toBeDisabled();
  await expect(
    settings.getByText(/remain unchanged and recoverable/),
  ).toBeVisible();
  await settings.getByRole("button", { name: "Save settings" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBe("{recoverable fixture");
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === "prompt-optimizer-settings-v2")
        throw new DOMException("Fixture deletion blocked", "SecurityError");
      return remove.call(this, key);
    };
  });
  await settings
    .getByRole("button", { name: "Forget legacy credentials" })
    .click();
  await expect(settings.getByRole("status")).toContainText(
    "could not be removed",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBe("{recoverable fixture");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settings
    .getByRole("button", { name: "Forget legacy credentials" })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("prompt-optimizer-settings-v2"),
    ),
  ).toBeNull();
});
