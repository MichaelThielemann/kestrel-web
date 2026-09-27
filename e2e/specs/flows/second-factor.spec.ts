import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, PORT, REPO_ROOT, WORK_DIR } from "../../support/env.ts";
import { totpNow } from "../../support/totp.ts";

const MFA_PORT = PORT + 1;
const MFA_URL = `http://127.0.0.1:${MFA_PORT}`;
const MFA_DIR = join(WORK_DIR, "second-factor");
let server: ChildProcess | undefined;
let adminRecoveryCodes: string[] = [];

test.describe.configure({ mode: "serial" });
test.use({ baseURL: MFA_URL, storageState: { cookies: [], origins: [] } });

test.beforeAll(async () => {
  rmSync(MFA_DIR, { recursive: true, force: true });
  mkdirSync(join(MFA_DIR, "data"), { recursive: true });
  const log = openSync(join(MFA_DIR, "server.log"), "w");
  server = spawn(process.execPath, [join(REPO_ROOT, "playground", ".output", "server", "index.mjs")], {
    stdio: ["ignore", log, log],
    env: { ...process.env, NODE_ENV: "production", PORT: String(MFA_PORT), NITRO_PORT: String(MFA_PORT), NITRO_HOST: "127.0.0.1", KESTREL_DATA_DIR: join(MFA_DIR, "data"), KESTREL_PLAYGROUND_MFA: "1", KESTREL_MFA_KEY: "3c".repeat(32), KESTREL_PLAYGROUND_LOGIN_LIMIT: "100" },
  });
  closeSync(log);
  for (let attempt = 0; attempt < 240; attempt++) {
    const ready = await fetch(`${MFA_URL}/api/ready`).then((r) => r.ok, () => false);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("the second-factor server did not become ready");
});

test.afterAll(() => {
  server?.kill("SIGTERM");
  server = undefined;
});

async function fillCredentials(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Benutzername" }).fill(username);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

async function setUp(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { level: 1, name: "Zweiten Faktor einrichten" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR-Code für Ihre Authenticator-App" })).toBeVisible();
  const secret = (await page.locator(".login-factor__secret").textContent())?.replace(/\s/g, "") ?? "";
  await page.getByLabel("Code", { exact: true }).fill(totpNow(secret));
  await page.getByRole("button", { name: "Bestätigen und anmelden" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Wiederherstellungscodes aufbewahren" })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(10);
  adminRecoveryCodes = (await page.getByRole("listitem").allTextContents()).map((code) => code.trim());
  await page.getByLabel("Ich habe die Codes gespeichert").check();
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
  return secret;
}

test("the first sign-in sets the factor up, and every later one asks for a code", async ({ page }) => {
  await fillCredentials(page, ADMIN.username, ADMIN.password);
  const secret = await setUp(page);

  await page.getByRole("button", { name: "Konto" }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await fillCredentials(page, ADMIN.username, ADMIN.password);
  await expect(page.getByRole("heading", { level: 1, name: "Code eingeben" })).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill("000000" === totpNow(secret, 1) ? "111111" : "000000");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Der Code ist falsch oder wurde schon verwendet.")).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill(totpNow(secret, 1));
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
});

test("an administrator resets another account's factor, which signs it out and asks it to set one up again", async ({ page, browser }) => {
  const recovery = [...adminRecoveryCodes];
  await fillCredentials(page, ADMIN.username, ADMIN.password);
  await expect(page.getByRole("heading", { level: 1, name: "Code eingeben" })).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill(recovery[0] ?? "");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);

  await page.goto("/admin/system?tab=users");
  await page.getByRole("button", { name: "Neuer Benutzer" }).click();
  const create = page.getByRole("dialog", { name: "Neuer Benutzer" });
  await create.getByLabel("Benutzername").fill("second-factor-probe");
  await create.getByLabel("Passwort", { exact: true }).fill("second factor probe passphrase");
  await create.getByLabel("Passwort bestätigen").fill("second factor probe passphrase");
  await create.getByLabel("Redakteur").check();
  await create.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("cell", { name: "second-factor-probe", exact: true })).toBeVisible();

  const other = await browser.newContext({ baseURL: MFA_URL, storageState: { cookies: [], origins: [] } });
  try {
    const probe = await other.newPage();
    await fillCredentials(probe, "second-factor-probe", "second factor probe passphrase");
    await setUp(probe);
    const token = (await other.cookies()).find((cookie) => cookie.name === "__Host-kestrel_token")?.value ?? "";
    expect((await probe.request.get("/api/me", { headers: { cookie: `__Host-kestrel_token=${token}` } })).status()).toBe(200);

    await page.reload();
    const row = page.getByRole("row", { name: /second-factor-probe/ });
    await expect(row.getByRole("cell", { name: "Eingerichtet" })).toBeVisible();
    await page.getByRole("button", { name: "Aktionen für second-factor-probe" }).click();
    await page.getByRole("menuitem", { name: "Zweiten Faktor zurücksetzen" }).click();
    const confirm = page.getByRole("dialog", { name: "Zweiten Faktor zurücksetzen" });
    await confirm.getByRole("button", { name: "Zweiten Faktor zurücksetzen" }).click();
    await expect(confirm).toBeHidden();
    await expect(row.getByRole("cell", { name: "Eingerichtet" })).toHaveCount(0);

    expect((await probe.request.get("/api/me", { headers: { cookie: `__Host-kestrel_token=${token}` } })).status()).toBe(401);
    await fillCredentials(probe, "second-factor-probe", "second factor probe passphrase");
    await expect(probe.getByRole("heading", { level: 1, name: "Zweiten Faktor einrichten" })).toBeVisible();
  } finally {
    await other.close();
  }
});
