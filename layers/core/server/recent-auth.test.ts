import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

describe("critical user and restore actions ask for the password again after a while", () => {
  let appRoot: string;
  let offset = 0;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-recent-auth-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
    offset = 0;
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + offset);
  });

  afterEach(async () => {
    await preset?.kestrel.stop();
    preset = undefined;
    vi.restoreAllMocks();
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("answers 403 REAUTH_REQUIRED on every guarded action once the last password check is older than five minutes, and lets it run after confirming", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const { call } = preset;
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    const target = await call("createUser", "POST /users", { headers, body: { username: "target", password: "correct horse battery", roles: ["editor"] } });
    expect(target.status).toBe(200);
    const id = boundaryCast<{ id: string }>(target.result, "host").id;

    const guarded: Array<[string, string, { body?: Record<string, unknown>; params?: Record<string, string> }]> = [
      ["createUser", "POST /users", { body: { username: "another", password: "correct horse battery", roles: ["editor"] } }],
      ["updateUser", "PATCH /users/:id", { params: { id }, body: { roles: ["admin"] } }],
      ["setPassword", "PUT /users/:id/password", { params: { id }, body: { password: "a different passphrase" } }],
      ["deactivateUser", "POST /users/:id/deactivate", { params: { id } }],
      ["activateUser", "POST /users/:id/activate", { params: { id } }],
      ["deleteUser", "DELETE /users/:id", { params: { id }, body: {} }],
      ["replicationRestore", "POST /admin/replication/restore", { body: {} }],
    ];

    offset += 301_000;
    for (const [pipeline, trigger, input] of guarded) {
      const refused = await call(pipeline, trigger, { headers, ...input });
      expect(refused.status, pipeline).toBe(403);
      expect(refused.code, pipeline).toBe("REAUTH_REQUIRED");
    }

    const wrong = await call("confirmPassword", "POST /me/confirm-password", { headers, body: { password: "not the password" } });
    expect(wrong.status).toBe(400);
    const confirmed = await call("confirmPassword", "POST /me/confirm-password", { headers, body: { password: ADMIN_PASSWORD } });
    expect(confirmed.status).toBe(200);

    for (const [pipeline, trigger, input] of guarded) {
      const run = await call(pipeline, trigger, { headers, ...input });
      expect(run.code, pipeline).not.toBe("REAUTH_REQUIRED");
    }
  }, 60_000);

  it("refuses setting one's own password without the current one", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    const me = await preset.call("me", "GET /me", { headers });
    const id = boundaryCast<{ id: string }>(me.result, "host").id;
    const own = await preset.call("setPassword", "PUT /users/:id/password", { headers, params: { id }, body: { password: "a different passphrase" } });
    expect(own.status).toBe(400);
  }, 60_000);
});
