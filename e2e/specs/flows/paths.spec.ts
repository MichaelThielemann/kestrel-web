import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

test("saving a page on a path another page holds shows the conflict at the slug", async ({ page }) => {
  await page.goto("/admin/pages/new?locale=de");
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Doppelt");
  const slug = page.getByRole("textbox", { name: "Slug" });
  await slug.fill("projekte");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(slug).toHaveAttribute("aria-invalid", "true");
  await expect(slug).toHaveAccessibleDescription(/\/projekte/);
  await expect(page).toHaveURL(/\/admin\/pages\/new/);
});

test("renaming a page answers its old path with a 301 to the new one", async ({ page, seed }) => {
  await page.goto(`/admin/pages/${seed.team}?locale=de`);
  const slug = page.getByRole("textbox", { name: "Slug" });
  await expect(slug).toHaveValue("team");
  await slug.fill("menschen");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Keine Änderungen zu speichern")).toBeVisible();

  const old = await page.request.get("/ueber-uns/team", { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(new URL(old.headers().location ?? "", "http://127.0.0.1").pathname).toBe("/ueber-uns/menschen");
  expect((await page.request.get("/ueber-uns/menschen")).status()).toBe(200);
});
