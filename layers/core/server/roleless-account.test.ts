import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

describe("a signed-in account without a role may only sign out and read who it is", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-roleless-"));
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

  it("answers 403 on the admin schema, media listings and other signed-in routes, 200 on me and logout, and public reads like anonymous", async () => {
    preset = await bootPlaygroundPreset(appRoot, { roles: { admin: ["*"], editor: ["pages.*", "blog.*", "media.*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "media.read"] });
    const { call } = preset;
    const admin = await preset.login("admin", ADMIN_PASSWORD);
    expect((await call("createUser", "POST /users", { headers: admin, body: { username: "nobody", password: "correct horse battery", roles: [] } })).status).toBe(200);
    const headers = await preset.login("nobody", "correct horse battery");

    for (const [pipeline, trigger] of [
      ["adminSchemaModel", "GET /admin/schema"],
      ["listMediaFolders", "GET /media/folders"],
      ["listMedia", "GET /media"],
      ["changePassword", "POST /me/password"],
      ["listAllPages", "GET /admin/pages"],
    ] as const) {
      const run = await call(pipeline, trigger, { headers, ...(pipeline === "changePassword" ? { body: { currentPassword: "correct horse battery", newPassword: "another passphrase" } } : {}) });
      expect(run.status, pipeline).toBe(403);
    }
    expect((await call("me", "GET /me", { headers })).status).toBe(200);

    const asRoleless = await call("getSettings", "GET /settings", { headers });
    const asAnonymous = await call("getSettings", "GET /settings");
    expect(asRoleless.status).toBe(200);
    expect(asRoleless.result).toEqual(asAnonymous.result);

    expect((await call("logout", "POST /logout", { headers })).status).toBe(200);
  }, 60_000);
});
