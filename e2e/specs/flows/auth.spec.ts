import { ADMIN, EDITOR_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test("an admin signs in, reaches the page list and signs out again", async ({ page }) => {
  await page.goto("/admin/pages");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByRole("textbox", { name: "Benutzername" }).fill(ADMIN.username);
  await page.getByLabel("Passwort", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Ungültige Anmeldedaten")).toBeVisible();

  await page.getByLabel("Passwort", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Seiten" })).toBeVisible();
  const token = (await page.context().cookies()).find((cookie) => cookie.name === "kestrel_token")?.value ?? "";
  expect(token).not.toBe("");

  await page.getByRole("button", { name: "Konto" }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  const me = await page.request.get("/api/me", { headers: { authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(401);
});

test.describe("an editor without admin rights", () => {
  test.use({ storageState: EDITOR_STATE });

  test("sees no admin-only navigation or actions", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "Seiten" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Insights" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Benutzer/ })).toHaveCount(0);
    await page.goto("/admin/system");
    await expect(page.getByRole("tab", { name: "Einstellungen" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Benutzer" })).toHaveCount(0);
  });

  test("is refused with 403 by the server for admin-only routes", async ({ editorApi }) => {
    expect((await editorApi.raw("GET", "/users")).status).toBe(403);
    expect((await editorApi.raw("GET", "/admin/insights/manifest")).status).toBe(403);
    expect((await editorApi.raw("PUT", "/settings", { locale: "de", title: "Nicht erlaubt", mounts: {} })).status).toBe(403);
  });
});
