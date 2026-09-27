import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: { cookies: [], origins: [] } });

test("an account without a role sees only a notice and the sign-out", async ({ page, adminApi }) => {
  await adminApi.call("POST", "/users", { username: "no-role-yet", password: "no role passphrase", roles: [] });
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Benutzername" }).fill("no-role-yet");
  await page.getByLabel("Passwort", { exact: true }).fill("no role passphrase");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Noch kein Zugriff" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
});
