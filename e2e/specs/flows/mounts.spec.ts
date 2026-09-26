import { ADMIN_STATE } from "../../support/env.ts";
import { isRecord } from "../../support/api.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

test("a collection mounted in the settings is reachable under its page and keeps the mount when another locale saves", async ({ page, seed, adminApi }) => {
  await page.goto("/admin/system?tab=settings");
  await page.getByRole("combobox", { name: "Blog" }).selectOption({ label: "Aktuelles (/aktuelles)" });
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Keine Änderungen zu speichern")).toBeVisible();

  expect((await page.request.get("/aktuelles/hallo")).status()).toBe(200);
  const moved = await page.request.get("/projekte/hallo", { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(new URL(moved.headers().location ?? "", "http://127.0.0.1").pathname).toBe("/aktuelles/hallo");

  await page.getByRole("link", { name: "EN bearbeiten" }).click();
  const title = page.getByRole("textbox", { name: "Website-Titel" });
  await expect(title).toHaveValue("Kestrel Example");
  await title.fill("Kestrel Example Site");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Keine Änderungen zu speichern")).toBeVisible();

  const settings = await adminApi.call("GET", "/settings?locale=en");
  expect(settings.title).toBe("Kestrel Example Site");
  expect(isRecord(settings.mounts) ? settings.mounts.blog : null).toBe(seed.news);
  expect((await page.request.get("/aktuelles/hallo")).status()).toBe(200);
});
