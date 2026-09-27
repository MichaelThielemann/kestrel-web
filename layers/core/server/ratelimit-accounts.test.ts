import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

describe("sign-ins and password checks are limited per account as well as per address", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-ratelimit-accounts-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(async () => {
    await preset?.kestrel.stop();
    preset = undefined;
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("refuses sign-ins to one account from many addresses once the account budget is spent", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) statuses.push((await preset.call("login", "POST /login", { body: { username: "admin", password: "not the password" }, ip: `198.51.100.${i}` })).status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10).every((status) => status === 429)).toBe(true);
  }, 60_000);

  it("counts one IPv6 /64 as one address", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const statuses: number[] = [];
    for (let i = 1; i <= 7; i++) statuses.push((await preset.call("login", "POST /login", { body: { username: `nobody-${i}`, password: "nothing" }, ip: `2001:db8:9:9::${i}` })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
  }, 60_000);

  it("refuses further password changes with a wrong current password after the limit", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await preset.call("changePassword", "POST /me/password", { headers, body: { currentPassword: `guess-${i}`, newPassword: "a new passphrase" }, ip: `203.0.113.${i}` })).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429, 429, 429]);
  }, 60_000);

  it("with e-mail sign-in, counts the e-mail the login reads, whatever else the body names", async () => {
    preset = await bootPlaygroundPreset(appRoot, undefined, { session: { identifier: "email" } });
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await preset.call("login", "POST /login", { body: { email: "admin", username: `decoy-${i}`, password: "not the password" }, ip: `198.51.100.${i}` })).status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10).every((status) => status === 429)).toBe(true);
  }, 60_000);

  it("never spends an account's budget on its own successful sign-ins, and a success clears earlier failures", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    for (let i = 0; i < 9; i++) expect((await preset.call("login", "POST /login", { body: { username: "admin", password: "wrong" }, ip: `203.0.113.${i}` })).status).toBe(401);
    for (let i = 0; i < 15; i++) expect((await preset.call("login", "POST /login", { body: { username: "admin", password: ADMIN_PASSWORD }, ip: `192.0.2.${i}` })).status).toBe(200);
    for (let i = 0; i < 9; i++) expect((await preset.call("login", "POST /login", { body: { username: "admin", password: "wrong" }, ip: `203.0.113.${50 + i}` })).status).toBe(401);
    expect((await preset.call("login", "POST /login", { body: { username: "admin", password: ADMIN_PASSWORD }, ip: "192.0.2.99" })).status).toBe(200);
  }, 60_000);
});
