import type { Page } from "@playwright/test";
import { save } from "../../support/editor.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

async function createPage(page: Page, fields: { title: string; slug: string; parent?: string }): Promise<void> {
  await page.goto("/admin/pages/new?locale=de");
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill(fields.title);
  if (fields.parent !== undefined) {
    await page.getByRole("combobox", { name: "Übergeordnete Seite" }).fill(fields.parent);
    await page.getByRole("option", { name: new RegExp(`^${fields.parent}`) }).first().click();
  }
  await page.getByRole("textbox", { name: "Slug" }).fill(fields.slug);
  await page.getByRole("combobox", { name: "Status" }).selectOption({ label: "Veröffentlicht" });
  const response = await save(page);
  expect(response.request().method()).toBe("POST");
  await expect(page.getByRole("heading", { level: 1, name: fields.title })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/pages\/[0-9a-f-]{36}/);
}

test("a page and a subpage created in the editor are published and server-rendered for a visitor under their full path", async ({ page, browser, baseURL, visitor }) => {
  await createPage(page, { title: "Leistungen", slug: "leistungen" });
  await createPage(page, { title: "Beratung", slug: "beratung", parent: "Leistungen" });

  await page.goto("/admin/pages");
  await expect(page.getByRole("row", { name: /^Leistungen \/leistungen Veröffentlicht/ })).toBeVisible();

  const response = await visitor.get("/leistungen/beratung");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<title>[^<]*Beratung[^<]*<\/title>/);
  expect(html).toContain('data-kestrel-build="');

  const anonymous = await browser.newContext({ baseURL });
  const visit = await anonymous.newPage();
  await visit.goto("/leistungen/beratung");
  await expect(visit).toHaveTitle(/Beratung/);
  await anonymous.close();
});
