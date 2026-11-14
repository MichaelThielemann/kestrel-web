import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset, type BootOptions } from "./__fixtures__/boot-preset";

describe("the redirect editor refuses sources under the paths the server answers itself", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-redirect-reserved-"));
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

  async function save(from: string, options?: BootOptions) {
    preset ??= await bootPlaygroundPreset(appRoot, undefined, options);
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    return preset.call("setRedirects", "PUT /redirects", { headers, body: { rules: [{ from, to: "/somewhere", status: "301" }] } });
  }

  it.each(["/admin", "/admin/x", "/api", "/api/pages", "/media/a.png", "/_nuxt/entry.js", "/__nuxt_island/x", "/__nuxt_error", "/_ipx/w_100/a.png", "/_preview/key", "/*/login", "/**"])("answers 400 with the row for the source %s", async (from) => {
    const run = await save(from);
    expect(run.status).toBe(400);
    expect(run.error).toMatch(/Row 1/);
  });

  it("keeps a source that only shares characters with a reserved path", async () => {
    expect((await save("/administration")).status).toBe(200);
  });

  it("reserves the build assets path the site sets and no longer /_nuxt", async () => {
    const options = { buildAssetsPath: "/assets" };
    const refused = await save("/assets/**", options);
    expect(refused.status).toBe(400);
    expect(refused.error).toMatch(/Row 1/);
    expect((await save("/_nuxt/entry.js", options)).status).toBe(200);
  });

  it("keeps an ordinary source", async () => {
    expect((await save("/old-team")).status).toBe(200);
  });
});
