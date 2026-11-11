import { expect, test, type Page } from "@playwright/test";

const ORIGINAL = "Write a poem about the sea. Make it short. Use rhyme.";
const RESULT = {
  optimized: "Write a poem about the sea. Keep it under twelve lines. Use rhyme. Avoid cliches.",
  summary: "Made the length concrete and added one constraint.",
  changes: ["Replaced 'short' with a number", "Asked for no cliches"],
  assumptions: [],
  warnings: [],
  unresolvedQuestions: ["Who is the poem for?"],
  qualityGate: { intentPreserved: 0.95, overEngineered: 0.1, passed: true, judge: "Google-Gemini-Decision-1" },
  completion: { model: "deepseek/deepseek-v4.1-flash", elapsedMs: 4200 },
};
const stream = (events: unknown[]) => events.map((event) => `${JSON.stringify(event)}\n`).join("");

async function mock(page: Page, options: { fail?: boolean; keyed?: boolean } = {}) {
  const keyed = options.keyed ?? true;
  await page.addInitScript((remember) => {
    if (remember)
      localStorage.setItem(
        "prompt-optimizer-settings-v3",
        JSON.stringify({ rememberKeys: true, deepseekApiKey: "fixture-key", autoDiagnose: false }),
      );
  }, keyed);
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/config"))
      return route.fulfill({
        json: {
          sharedAccess: false,
          deepseek: false,
          openrouter: false,
          decisions: {
            typesafe: false,
            mouse: false,
            decision1: false,
            order: ["typesafe", "mouse", "decision1"],
          },
        },
      });
    if (url.endsWith("/diagnose"))
      return route.fulfill({
        json: {
          clarityScore: 2,
          clarityLabel: "Clear instructions",
          isAmbiguous: 0.2,
          lacksConstraints: 0.4,
          lacksRole: 0.3,
          injectionRisk: 0,
          issues: [],
          strengths: [],
          heuristic: true,
          engine: "rule-based",
        },
      });
    if (url.endsWith("/optimize")) {
      const body = options.fail
        ? stream([{ stage: "rewrite" }, { error: "Provider deadline exceeded.", requestId: "req-e2e" }])
        : stream([{ stage: "diagnose" }, { stage: "rewrite" }, { stage: "verify" }, { result: RESULT }]);
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }
    return route.fulfill({ status: 404, json: { error: "not mocked" } });
  });
}
const draft = (page: Page) => page.getByLabel("Draft", { exact: true });
async function runIt(page: Page) {
  await draft(page).fill(ORIGINAL);
  await page.getByRole("button", { name: "Optimize prompt" }).click();
  await expect(page.getByText("Edit 1 of 2")).toBeVisible();
}

test.describe("the redline flow", () => {
  test("run, revert one edit, and the final prompt follows", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await runIt(page);
    const final = page.getByLabel("Final prompt");
    await expect(final).toHaveValue(RESULT.optimized);
    await page.getByRole("button", { name: "Revert this edit" }).first().click();
    await expect(final).toHaveValue(/Make it short\./);
    await expect(final).toHaveValue(/Avoid cliches\./);
    await page.getByRole("button", { name: "Keep this edit" }).click();
    await expect(final).toHaveValue(RESULT.optimized);
    await expect(page.getByText("Checked.")).toBeVisible();
  });

  test("keyboard only: ctrl+enter runs, j moves to an edit, space flips it", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await draft(page).fill(ORIGINAL);
    await draft(page).press("Control+Enter");
    await expect(page.getByText("Edit 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Revert this edit" }).first().focus();
    await page.keyboard.press("j");
    await expect(page.getByRole("button", { name: "Revert this edit" }).nth(1)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Keep this edit" })).toBeVisible();
    await page.keyboard.press("k");
    await expect(page.getByRole("button", { name: "Revert this edit" }).first()).toBeFocused();
  });

  test("a failed run says what happened and offers to run again", async ({ page }) => {
    await mock(page, { fail: true });
    await page.goto("/");
    await draft(page).fill(ORIGINAL);
    await page.getByRole("button", { name: "Optimize prompt" }).click();
    const alert = page.locator(".failure");
    await expect(alert).toContainText("Provider deadline exceeded.");
    await expect(alert).toContainText("req-e2e");
    await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
  });

  test("without a key the run offers the fix and opens Settings", async ({ page }) => {
    await mock(page, { keyed: false });
    await page.goto("/");
    await draft(page).fill(ORIGINAL);
    const fix = page.getByRole("button", { name: "Add a key to start" });
    await expect(fix).toBeEnabled();
    await fix.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("DeepSeek API key")).toBeFocused();
  });

  test("the primary action is fully visible at 1366x768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await mock(page, { keyed: false });
    await page.goto("/");
    const box = await page.getByRole("button", { name: "Add a key to start" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  });

  test("settings: key first, Save in view, and saving unblocks the run", async ({ page }) => {
    await mock(page, { keyed: false });
    await page.goto("/");
    await page.getByRole("button", { name: "Add a key to start" }).click();
    await expect(page.getByLabel("DeepSeek API key")).toBeFocused();
    const save = page.getByRole("button", { name: "Save settings" });
    const box = await save.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await page.getByLabel("DeepSeek API key").fill("sk-fixture-only");
    await save.click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("Saved");
    await page.getByRole("button", { name: "Close Settings" }).click();
    await draft(page).fill(ORIGINAL);
    await expect(page.getByRole("button", { name: "Optimize prompt" })).toBeEnabled();
  });

  test("image prompt: the likeness lock is 44px and edits the draft", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Image prompt" }).click();
    const lock = page.getByRole("button", { name: "Lock subject likeness" });
    const box = await lock.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await lock.click();
    const on = page.getByRole("button", { name: "Likeness lock on" });
    await expect(on).toHaveAttribute("aria-pressed", "true");
    await expect(draft(page)).toHaveValue(/The subject in the photo/);
    await on.click();
    await expect(draft(page)).not.toHaveValue(/The subject in the photo/);
  });

  test("video options keep Veo and Omni 1.1 and add Omni 1.2", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Video prompt" }).click();
    const profile = page.getByLabel("Writing for");
    expect(await profile.locator("option").allTextContents()).toEqual([
      "General",
      "Google Veo 3.1",
      "Gemini Omni 1.1",
      "Google Omni 1.2 Flash",
    ]);
    await profile.selectOption("omni-1.2");
    await expect(
      page.getByText("Text guidance only; video is not generated here."),
    ).toBeVisible();
    const lock = page.getByRole("button", { name: "Lock subject likeness" });
    await expect(lock).toBeVisible();
    await draft(page).fill("The subject in the photo walks along a pier.");
    await expect(
      page.getByRole("button", { name: "Likeness lock on" }),
    ).toBeVisible();
  });

  test("direct /settings loads remembered keys and Save does not wipe them", async ({ page }) => {
    await mock(page);
    await page.goto("/settings");
    await expect(page.getByLabel("DeepSeek API key")).toHaveValue("fixture-key");
    await page.getByRole("button", { name: "Save settings" }).click();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("prompt-optimizer-settings-v3")!),
    );
    expect(stored.deepseekApiKey).toBe("fixture-key");
  });

  test("direct /settings warns before leaving with unsaved changes", async ({ page }) => {
    await mock(page);
    await page.goto("/settings");
    await expect(page.getByLabel("DeepSeek API key")).toHaveValue("fixture-key");
    await page.getByLabel("DeepSeek API key").fill("changed-key");
    await page.waitForTimeout(150);
    let asked = false;
    page.on("dialog", async (dialog) => {
      asked = true;
      await dialog.dismiss();
    });
    await page.getByRole("link", { name: "Back to workbench" }).click();
    expect(asked).toBe(true);
    expect(new URL(page.url()).pathname).toBe("/settings");
    page.removeAllListeners("dialog");
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Back to workbench" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("history restores the final text after a revert", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await runIt(page);
    await page.getByRole("button", { name: "Revert this edit" }).first().click();
    const final = page.getByLabel("Final prompt");
    await expect(final).toHaveValue(/Make it short\./);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.locator(".history-preview").first()).toContainText(
      "Make it short.",
    );
    await page.getByRole("button", { name: "Load saved prompt" }).click();
    await expect(page.getByLabel("Final prompt")).toHaveValue(/Make it short\./);
    await expect(page.getByRole("button", { name: "Keep this edit" })).toBeVisible();
  });

  test("history restores a hand-edited final prompt", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await runIt(page);
    await page.getByLabel("Final prompt").fill("Hand edited final prompt.");
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.locator(".history-preview").first()).toContainText(
      "Hand edited final prompt.",
    );
    await page.getByRole("button", { name: "Load saved prompt" }).click();
    await expect(page.getByLabel("Final prompt")).toHaveValue(
      "Hand edited final prompt.",
    );
    await expect(page.getByText("Edited by hand")).toBeVisible();
  });

  test("history uses human labels and confirms a clear inside the dialog", async ({ page }) => {
    await mock(page);
    await page.goto("/");
    await runIt(page);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByText(/User prompt · Restructure · General/)).toBeVisible();
    await page.getByRole("button", { name: "Clear history" }).click();
    await expect(page.getByText("Delete all local history, including favorites?")).toBeVisible();
    await page.getByRole("button", { name: "Keep history" }).click();
    await expect(page.getByRole("button", { name: "Load saved prompt" })).toBeVisible();
    await page.getByRole("button", { name: "Clear history" }).click();
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page.getByText("No saved prompts yet.")).toBeVisible();
  });
});

test.describe("dialogs", () => {
  for (const name of ["Settings", "History"]) {
    test(`${name} traps focus, closes on Escape and returns focus`, async ({ page }) => {
      await mock(page);
      await page.goto("/");
      const opener = page.getByRole("button", { name, exact: true });
      await opener.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
    });
  }
});

test.describe("layout at the three widths", () => {
  for (const [label, width, height] of [
    ["phone", 390, 844],
    ["tablet", 768, 1024],
    ["desktop", 1440, 900],
  ] as const) {
    test(`${label}: no sideways scroll, 44px targets, visible focus`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await mock(page);
      await page.goto("/");
      await runIt(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const small = await page.evaluate(() => {
        const out: string[] = [];
        const controls = document.querySelectorAll<HTMLElement>(
          "button, select, textarea, input:not([type=hidden]), summary",
        );
        controls.forEach((el) => {
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) return;
          if (el.classList.contains("link")) return; // inline text link inside a sentence
          if (box.height < 43.5)
            out.push(
              `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(box.height)}px`,
            );
        });
        return out;
      });
      expect(small).toEqual([]);

      // every control shows a focus ring when reached by keyboard
      const missing: string[] = [];
      await page.keyboard.press("Tab");
      for (let i = 0; i < 25; i++) {
        const reached = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null; // dev overlay, not the page
          const style = getComputedStyle(el);
          return {
            name: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
            ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
          };
        });
        if (reached && !reached.ring) missing.push(reached.name);
        await page.keyboard.press("Tab");
      }
      expect(missing).toEqual([]);

      await page.screenshot({ path: testInfo.outputPath(`${label}.png`), fullPage: true });
    });
  }

  test("reduced motion: the lamps do not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mock(page);
    await page.goto("/");
    const duration = await page.evaluate(() => {
      const lamp = document.querySelector(".lamp");
      return lamp ? getComputedStyle(lamp).transitionDuration : "missing";
    });
    expect(duration).toBe("0s");
  });
});

test("no em dash anywhere in the visible interface", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await runIt(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain("—");
});
