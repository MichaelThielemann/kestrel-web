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

  async function enroll(p: BootedPreset, username: string, password: string): Promise<{ secret: string; headers: Record<string, string>; recoveryCodes: string[] }> {
    const refused = await p.call("login", "POST /login", { ip: nextIp(), body: { username, password } });
    expect(refused).toMatchObject({ status: 401, code: "SECOND_FACTOR_SETUP_REQUIRED" });
    const started = await p.call("setupSecondFactor", "POST /login/second-factor", { ip: nextIp(), body: { username, password } });
    expect(started.status).toBe(200);
    const { secret } = boundaryCast<{ secret: string }>(started.result, "host");
    const confirmed = await p.call("login", "POST /login", { ip: nextIp(), body: { username, password, code: codeNow(secret) } });
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
});
