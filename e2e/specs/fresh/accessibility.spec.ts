import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  return results.violations.map((violation) => `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test.use({ storageState: ADMIN_STATE });

test("the page list has no WCAG 2.2 AA violation", async ({ page }) => {
  await page.goto("/admin/pages");
  await expect(page.getByRole("treegrid")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the page editor has no WCAG 2.2 AA violation", async ({ page, seed }) => {
  await page.goto(`/admin/pages/${seed.about}?locale=de`);
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue("Über uns");
  expect(await violations(page)).toEqual([]);
});

test("the media library has no WCAG 2.2 AA violation", async ({ page }) => {
  await page.goto("/admin/media");
  await expect(page.getByRole("button", { name: /landscape\.png/ })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the media library with a selection has no WCAG 2.2 AA violation", async ({ page }) => {
  await page.goto("/admin/media");
  await page.getByRole("checkbox", { name: /^landscape\.png auswählen$/ }).check();
  await expect(page.getByRole("toolbar", { name: "1 Element ausgewählt" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the media trash has no WCAG 2.2 AA violation, empty, with an item and with a selection", async ({ page, seed, adminApi }) => {
  await page.goto("/admin/media?trash=1");
  await expect(page.getByRole("heading", { name: "Papierkorb" })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await adminApi.call("POST", "/media/trash", { ids: [seed.spare] });
  try {
    await page.reload();
    await expect(page.getByRole("button", { name: "Papierkorb leeren" })).toBeVisible();
    await expect(page.getByRole("button", { name: "spare.png wiederherstellen" })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole("checkbox", { name: /^spare\.png auswählen$/ }).check();
    await expect(page.getByRole("toolbar", { name: "1 Element ausgewählt" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  } finally {
    await adminApi.call("POST", "/media/trash/restore", { ids: [seed.spare] });
  }
});

test("the settings have no WCAG 2.2 AA violation", async ({ page }) => {
  await page.goto("/admin/system?tab=settings");
  await expect(page.getByRole("textbox", { name: "Website-Titel" })).toHaveValue("Kestrel Beispiel");
  expect(await violations(page)).toEqual([]);
});

test("the media picker dialog has no WCAG 2.2 AA violation", async ({ page, seed }) => {
  await page.goto(`/admin/pages/${seed.news}?locale=de`);
  await page.getByRole("button", { name: "Share-Bild" }).click();
  const picker = page.getByRole("dialog", { name: "Datei auswählen" });
  await expect(picker.getByRole("button", { name: /^landscape\.png/ })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
