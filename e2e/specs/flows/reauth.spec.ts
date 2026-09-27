import { ADMIN } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";
import { ageSessionAuth } from "../../support/sessions.ts";

test.use({ storageState: { cookies: [], origins: [] } });

test("creating a user after a while asks for the password again and then goes through", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Benutzername" }).fill(ADMIN.username);
  await page.getByLabel("Passwort", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
  const token = (await page.context().cookies()).find((cookie) => cookie.name === "kestrel_token")?.value ?? "";
  ageSessionAuth(token, 600);

  await page.goto("/admin/system?tab=users");
  await page.getByRole("button", { name: "Neuer Benutzer" }).click();
  const create = page.getByRole("dialog", { name: "Neuer Benutzer" });
  await create.getByLabel("Benutzername").fill("reauth-probe");
  await create.getByLabel("Passwort", { exact: true }).fill("reauth probe passphrase");
  await create.getByLabel("Passwort bestätigen").fill("reauth probe passphrase");
  await create.getByRole("button", { name: "Erstellen" }).click();

  const confirm = page.getByRole("dialog", { name: "Passwort erneut eingeben" });
  await expect(confirm).toBeVisible();
  await confirm.getByLabel("Passwort", { exact: true }).fill("not-the-password");
  await confirm.getByRole("button", { name: "Bestätigen" }).click();
  await expect(confirm.getByText("Das Passwort ist falsch.")).toBeVisible();
  await confirm.getByLabel("Passwort", { exact: true }).fill(ADMIN.password);
  await confirm.getByRole("button", { name: "Bestätigen" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("cell", { name: "reauth-probe", exact: true })).toBeVisible();
});
