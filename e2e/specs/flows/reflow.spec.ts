import type { Page } from "@playwright/test";
import { submitSave } from "../../support/editor.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE, viewport: { width: 320, height: 640 } });

const CONTROLS = "a[href], button, input, select, textarea, [role='tab'], [role='button'], [role='checkbox'], [role='switch'], [tabindex='0']";

interface Reflow {
  documentWidth: number;
  viewportWidth: number;
  outside: string[];
  shifted: string[];
}

async function measureReflow(page: Page): Promise<Reflow> {
  return page.evaluate((selector) => {
    const main = document.querySelector("main");
    const viewportWidth = document.documentElement.clientWidth;
    const describe = (element: Element): string => `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).join(".")}` : ""} "${(element.textContent ?? "").trim().slice(0, 40)}"`;
    const clippedBy = (element: Element, rect: DOMRect): Element | "table scroll region" | null => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX;
        if ((overflow === "auto" || overflow === "scroll") && node.querySelector("table")?.contains(element)) return "table scroll region";
        if (overflow !== "visible") {
          const box = node.getBoundingClientRect();
          if (rect.left < box.left - 1 || rect.right > box.right + 1) return node;
        }
        if (node === main) return null;
      }
      return null;
    };
    const outside: string[] = [];
    const shifted: string[] = [];
    if (main) {
      for (const element of Array.from(main.querySelectorAll(selector))) {
        if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: false })) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const clip = clippedBy(element, rect);
        if (clip === "table scroll region") continue;
        if (clip) outside.push(`${describe(element)} clipped by ${describe(clip).split(" ")[0]}`);
        else if (rect.right > viewportWidth + 1) outside.push(`${describe(element)} past the viewport`);
      }
      for (const element of Array.from(main.querySelectorAll("*"))) {
        if (element.scrollLeft !== 0 && getComputedStyle(element).overflowX === "hidden") shifted.push(describe(element));
      }
    }
    return { documentWidth: document.documentElement.scrollWidth, viewportWidth, outside, shifted };
  }, CONTROLS);
}

async function expectReflow(page: Page): Promise<void> {
  const reflow = await measureReflow(page);
  expect.soft(reflow.documentWidth, `the document scrolls horizontally at ${page.url()}`).toBeLessThanOrEqual(reflow.viewportWidth);
  expect.soft(reflow.outside, `controls reach past the visible width at ${page.url()}`).toEqual([]);
  expect.soft(reflow.shifted, `clipped regions are scrolled sideways at ${page.url()}`).toEqual([]);
}

async function systemTabIds(page: Page): Promise<string[]> {
  await page.goto("/admin/system");
  const tabs = page.getByRole("tablist").getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  const ids = await tabs.evaluateAll((elements) => elements.map((element) => element.id.replace(/^system-tab-/, "")));
  expect(ids.length).toBeGreaterThan(0);
  return ids;
}

test("every system tab fits a 320 px wide viewport without horizontal scrolling", async ({ page }) => {
  for (const tab of await systemTabIds(page)) {
    await test.step(tab, async () => {
      await page.goto(`/admin/system?tab=${tab}`);
      await expect(page.locator(`#system-panel-${tab}`)).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectReflow(page);
    });
  }
});

test("the list and editor pages fit a 320 px wide viewport without horizontal scrolling", async ({ page, seed }) => {
  const paths = ["/admin", "/admin/pages", `/admin/pages/${seed.home}`, "/admin/blog", `/admin/blog/${seed.post}`, "/admin/media", "/admin/insights"];
  for (const path of paths) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectReflow(page);
    });
  }
});

test("a refused redirect row keeps the redirects tab within a 320 px wide viewport", async ({ page }) => {
  await page.goto("/admin/system?tab=redirects");
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  await page.getByRole("textbox", { name: "Von" }).last().fill("/admin/x");
  await page.getByRole("textbox", { name: "Nach" }).last().fill("/team");
  const response = await submitSave(page);
  expect(response.status()).toBe(400);
  await expect(page.locator(".ui-repeater__row .ui-field__error")).toBeVisible();
  await expectReflow(page);
});
