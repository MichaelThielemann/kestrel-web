import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

describe("roles.anonymous of the playground preset", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-anonymous-permissions-"));
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

  it.each([["*"], ["pages.*"], ["pages.write"], ["media.list"]])("refuses to start with %s among the anonymous permissions", async (permission) => {
    await expect(bootPlaygroundPreset(appRoot, { roles: { admin: ["*"] }, anonymous: ["pages.read", permission] })).rejects.toThrow(/anonymous/);
  }, 60_000);

  it("starts with read permissions only and serves the public reads without a session", async () => {
    preset = await bootPlaygroundPreset(appRoot, { roles: { admin: ["*"] }, anonymous: ["pages.read", "blog.read", "settings.read", "media.read"] });
    expect((await preset.call("listPages", "GET /pages")).status).toBe(200);
    expect((await preset.call("createPage", "POST /pages", { body: { locale: "de", slug: "x", title: "X", status: "draft", body: [] } })).status).toBe(401);
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    expect((await preset.call("listUsers", "GET /users", { headers })).status).toBe(200);
  }, 60_000);
});
