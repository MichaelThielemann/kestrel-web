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
  await expect(page.getByText(/can match the reserved path \/admin/).first()).toBeVisible();
  await expect(from).toHaveValue("/admin/x");
});

test("a redirect source that only shares characters with a reserved path is saved", async ({ page }) => {
  await page.goto("/admin/system?tab=redirects");
  await page.getByRole("button", { name: "Eintrag hinzufügen" }).click();
  await page.getByRole("textbox", { name: "Von" }).fill("/administration");
  await page.getByRole("textbox", { name: "Nach" }).fill("/team");
  const response = await submitSave(page);
  expect(response.status()).toBe(200);
});
