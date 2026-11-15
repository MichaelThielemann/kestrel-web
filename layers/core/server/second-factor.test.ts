import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { base32Decode, totp } from "@michaelthielemann/kestrel-mfa-totp/impl";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

const KEY = "5a".repeat(32);
const ROLES = { roles: { admin: ["*"], editor: ["pages.*", "blog.*", "media.*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "media.read"] };
let address = 0;
const nextIp = () => `198.51.100.${(address++ % 250) + 1}`;
const codeNow = (secret: string, offset = 0) => totp(base32Decode(secret), Math.floor(Date.now() / 30_000) + offset);

describe("the mfa feature asks for a second factor at sign-in", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-second-factor-"));
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

  async function enroll(p: BootedPreset, username: string, password: string, ip?: string): Promise<{ secret: string; headers: Record<string, string>; recoveryCodes: string[] }> {
    const refused = await p.call("login", "POST /login", { ip: ip ?? nextIp(), body: { username, password } });
    expect(refused).toMatchObject({ status: 401, code: "SECOND_FACTOR_SETUP_REQUIRED" });
    const started = await p.call("setupSecondFactor", "POST /login/second-factor", { ip: ip ?? nextIp(), body: { username, password } });
    expect(started.status).toBe(200);
    const { secret } = boundaryCast<{ secret: string }>(started.result, "host");
    const confirmed = await p.call("login", "POST /login", { ip: ip ?? nextIp(), body: { username, password, code: codeNow(secret) } });
    expect(confirmed.status).toBe(200);
    const result = boundaryCast<{ token: string; recoveryCodes: string[] }>(confirmed.result, "host");
    return { secret, headers: { authorization: `Bearer ${result.token}` }, recoveryCodes: result.recoveryCodes };
  }

  it("lets no account in without setting up a factor, then wants a code every time", async () => {
    preset = await bootPlaygroundPreset(appRoot, ROLES, { features: ["mfa"], mfa: { secretKey: KEY } });
    const { secret, headers, recoveryCodes } = await enroll(preset, "admin", ADMIN_PASSWORD);
    expect(recoveryCodes).toHaveLength(10);
    expect((await preset.call("me", "GET /me", { headers })).status).toBe(200);
    expect(await preset.call("login", "POST /login", { ip: nextIp(), body: { username: "admin", password: ADMIN_PASSWORD } })).toMatchObject({ status: 401, code: "SECOND_FACTOR_REQUIRED" });
    expect((await preset.call("login", "POST /login", { ip: nextIp(), body: { username: "admin", password: ADMIN_PASSWORD, code: codeNow(secret, 1) } })).status).toBe(200);
    expect((await preset.call("login", "POST /login", { ip: nextIp(), body: { username: "admin", password: ADMIN_PASSWORD, code: recoveryCodes[0] ?? "" } })).status).toBe(200);
    expect((await preset.call("login", "POST /login", { ip: nextIp(), body: { username: "admin", password: ADMIN_PASSWORD, code: recoveryCodes[0] ?? "" } })).status).toBe(401);
  }, 60_000);

  it("an administrator resets another account's factor, which ends all its sessions and shows in the user list", async () => {
    preset = await bootPlaygroundPreset(appRoot, ROLES, { features: ["mfa"], mfa: { secretKey: KEY } });
    const { call } = preset;
    const admin = await enroll(preset, "admin", ADMIN_PASSWORD);
    const created = await call("createUser", "POST /users", { headers: admin.headers, body: { username: "bob", password: "correct horse battery", roles: ["editor"] } });
    const bobId = boundaryCast<{ id: string }>(created.result, "host").id;
    const bob = await enroll(preset, "bob", "correct horse battery");
    expect((await call("secondFactorUsers", "GET /users/second-factor", { headers: admin.headers })).result).toEqual(expect.arrayContaining([bobId]));

    const reset = await call("resetSecondFactor", "DELETE /users/:id/second-factor", { headers: admin.headers, params: { id: bobId } });
    expect(reset.status).toBe(200);
    const { enrollmentCode } = boundaryCast<{ enrollmentCode: string }>(reset.result, "host");
    expect((await call("me", "GET /me", { headers: bob.headers })).status).toBe(401);
    expect(boundaryCast<string[]>((await call("secondFactorUsers", "GET /users/second-factor", { headers: admin.headers })).result, "host")).not.toContain(bobId);
    expect(await call("login", "POST /login", { body: { username: "bob", password: "correct horse battery" } })).toMatchObject({ status: 401, code: "SECOND_FACTOR_SETUP_REQUIRED" });
    expect(await call("setupSecondFactor", "POST /login/second-factor", { ip: nextIp(), body: { username: "bob", password: "correct horse battery" } })).toMatchObject({ status: 403, code: "ENROLLMENT_CODE_REQUIRED" });
    expect(await call("setupSecondFactor", "POST /login/second-factor", { ip: nextIp(), body: { username: "bob", password: "correct horse battery", enrollmentCode } })).toMatchObject({ status: 200 });
  }, 60_000);

  it("an administrator issues another enrollment code when the first was lost, and only the newest one sets up the factor", async () => {
    preset = await bootPlaygroundPreset(appRoot, ROLES, { features: ["mfa"], mfa: { secretKey: KEY } });
    const { call } = preset;
    const admin = await enroll(preset, "admin", ADMIN_PASSWORD);
    const created = await call("createUser", "POST /users", { headers: admin.headers, body: { username: "bob", password: "correct horse battery", roles: ["editor"] } });
    const bobId = boundaryCast<{ id: string }>(created.result, "host").id;
    await enroll(preset, "bob", "correct horse battery");
    const enrolled = async () => boundaryCast<string[]>((await call("secondFactorUsers", "GET /users/second-factor", { headers: admin.headers })).result, "host");

    const first = await call("resetSecondFactor", "DELETE /users/:id/second-factor", { headers: admin.headers, params: { id: bobId } });
    const lost = boundaryCast<{ enrollmentCode: string }>(first.result, "host").enrollmentCode;
    expect(await enrolled()).not.toContain(bobId);
    const again = await call("resetSecondFactor", "DELETE /users/:id/second-factor", { headers: admin.headers, params: { id: bobId } });
    expect(again.status).toBe(200);
    const issued = boundaryCast<{ enrollmentCode: string }>(again.result, "host").enrollmentCode;
    expect(issued).not.toBe(lost);

    expect(await call("login", "POST /login", { ip: nextIp(), body: { username: "bob", password: "correct horse battery" } })).toMatchObject({ status: 401, code: "SECOND_FACTOR_SETUP_REQUIRED" });
    expect(await call("setupSecondFactor", "POST /login/second-factor", { ip: nextIp(), body: { username: "bob", password: "correct horse battery", enrollmentCode: lost } })).toMatchObject({ status: 403, code: "ENROLLMENT_CODE_REQUIRED" });
    const started = await call("setupSecondFactor", "POST /login/second-factor", { ip: nextIp(), body: { username: "bob", password: "correct horse battery", enrollmentCode: issued } });
    expect(started.status).toBe(200);
    const { secret } = boundaryCast<{ secret: string }>(started.result, "host");
    const confirmed = await call("login", "POST /login", { ip: nextIp(), body: { username: "bob", password: "correct horse battery", code: codeNow(secret) } });
    expect(confirmed.status).toBe(200);
    expect(boundaryCast<{ recoveryCodes: string[] }>(confirmed.result, "host").recoveryCodes).toHaveLength(10);
    expect(await enrolled()).toContain(bobId);
    expect(await call("setupSecondFactor", "POST /login/second-factor", { ip: nextIp(), body: { username: "bob", password: "correct horse battery", enrollmentCode: issued } })).toMatchObject({ status: 409 });
  }, 60_000);

  it("lets several accounts behind one address set up their factor and sign in within the same minute", async () => {
    preset = await bootPlaygroundPreset(appRoot, ROLES, { features: ["mfa"], mfa: { secretKey: KEY } });
    const { call } = preset;
    const admin = await enroll(preset, "admin", ADMIN_PASSWORD);
    const office = "203.0.113.50";
    const editors = ["bob", "carol", "dave"];
    for (const username of editors) {
      expect((await call("createUser", "POST /users", { headers: admin.headers, body: { username, password: "correct horse battery", roles: ["editor"] } })).status).toBe(200);
    }
    const secrets = [];
    for (const username of editors) secrets.push((await enroll(preset, username, "correct horse battery", office)).secret);
    for (const [index, username] of editors.entries()) {
      expect(await call("login", "POST /login", { ip: office, body: { username, password: "correct horse battery" } })).toMatchObject({ status: 401, code: "SECOND_FACTOR_REQUIRED" });
      expect((await call("login", "POST /login", { ip: office, body: { username, password: "correct horse battery", code: codeNow(secrets[index] ?? "", 1) } })).status).toBe(200);
    }
  }, 60_000);
});
