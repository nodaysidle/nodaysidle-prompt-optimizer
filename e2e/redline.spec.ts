import { expect, test, type Page } from "@playwright/test";

const ORIGINAL = "Write a poem about the sea. Make it short. Use rhyme.";
const RESULT = {
  optimized: "Write a poem about the sea. Keep it under twelve lines. Use rhyme. Avoid cliches.",
  summary: "Made the length concrete and added one constraint.",
  changes: ["Replaced 'short' with a number", "Asked for no cliches"],
  assumptions: [],
  warnings: [],
  unresolvedQuestions: ["Who is the poem for?"],
  qualityGate: { intentPreserved: 0.95, overEngineered: 0.1, passed: true, judge: "Microsoft-Decision-1" },
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
      return route.fulfill({ json: { sharedAccess: false, deepseek: false, openrouter: false } });
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

  test("without a key the run is blocked and Settings is one click away", async ({ page }) => {
    await mock(page, { keyed: false });
    await page.goto("/");
    await draft(page).fill(ORIGINAL);
    await expect(page.getByRole("button", { name: "Optimize prompt" })).toBeDisabled();
    await page.getByRole("button", { name: "Open Settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
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
