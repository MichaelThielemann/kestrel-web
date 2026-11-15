import { submitSave } from "../../support/editor.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

test("a redirect source under a path the server answers itself is refused at its row", async ({ page }) => {
  await page.goto("/admin/system?tab=redirects");
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  const from = page.getByRole("textbox", { name: "Von" });
  await from.fill("/admin/x");
  await page.getByRole("textbox", { name: "Nach" }).fill("/team");

  const response = await submitSave(page);
  expect(response.status()).toBe(400);
  const reason = "„Von“ kann auf den reservierten Pfad /admin passen, den der Server selbst beantwortet.";
  await expect(page.locator(".ui-repeater__row").first().locator(".ui-field__error")).toHaveText(reason);
  await expect(from).toHaveAccessibleDescription(reason);
  await expect(page.locator(".editor__error")).toContainText(`Speichern fehlgeschlagen — Zeile 1: ${reason.slice(0, -1)} (HTTP 400`);
  await expect(page.getByRole("region", { name: "Benachrichtigungen" }).getByText(reason.slice(0, -1))).toBeVisible();
  await expect(page.locator(".editor__error")).not.toContainText("can match the reserved path");
  await expect(from).toHaveValue("/admin/x");
});

test("a redirect source under the build assets path is refused at its row", async ({ page }) => {
  await page.goto("/admin/system?tab=redirects");
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  const from = page.getByRole("textbox", { name: "Von" });
  await from.fill("/_nuxt/entry.js");
  await page.getByRole("textbox", { name: "Nach" }).fill("/team");

  const response = await submitSave(page);
  expect(response.status()).toBe(400);
  await expect(page.locator(".ui-repeater__row .ui-field__error")).toContainText("reservierten Pfad /_nuxt");
});

test("a redirect source that only shares characters with a reserved path is saved", async ({ page }) => {
  await page.goto("/admin/system?tab=redirects");
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  await page.getByRole("textbox", { name: "Von" }).fill("/administration");
  await page.getByRole("textbox", { name: "Nach" }).fill("/team");
  const response = await submitSave(page);
  expect(response.status()).toBe(200);
});
