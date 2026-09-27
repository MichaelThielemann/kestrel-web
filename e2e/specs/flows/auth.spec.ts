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
  const session = (await page.context().cookies()).find((cookie) => cookie.name === "__Host-kestrel_token");
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  const token = session?.value ?? "";
  expect(token).not.toBe("");
  expect(await page.evaluate(() => document.cookie)).not.toContain("__Host-kestrel_token");
  expect(await page.evaluate(() => document.cookie)).not.toContain(token);
  const device = (await page.context().cookies()).find((cookie) => cookie.name === "__Host-kestrel_device");
  expect(device).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("__Host-kestrel_device");
  const cookie = `__Host-kestrel_token=${token}`;
  expect((await page.request.post("/api/logout", { headers: { cookie } })).status()).toBe(403);
  expect((await page.request.post("/api/logout", { headers: { cookie, origin: "http://elsewhere.example" } })).status()).toBe(403);
  expect((await page.request.post("/api/logout", { headers: { cookie, "sec-fetch-site": "same-site" } })).status()).toBe(403);
  expect((await page.request.post("/api/logout", { headers: { cookie, "content-type": "text/plain", "sec-fetch-site": "same-origin" }, data: "{}" })).status()).toBe(415);
  expect((await page.request.get("/api/me", { headers: { cookie } })).status()).toBe(200);

  await page.getByRole("button", { name: "Konto" }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  const me = await page.request.get("/api/me", { headers: { authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(401);
  expect((await page.context().cookies()).find((cookie) => cookie.name === "__Host-kestrel_device")?.value).toBe(device?.value);
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
