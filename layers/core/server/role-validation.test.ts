import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boot, defineConfig } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";

const PASSWORD_HASH = "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

interface UserRecord {
  id: string;
  username: string;
  roles: string[];
}

describe("createUser and updateUser reject an unknown role name before writing anything", () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-role-validation-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  async function bootPreset() {
    const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
    const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
    const { default: fieldTypes } = await import("../../../playground/shared/field-types");

    const moduleConfig = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features,
      collectionsUi,
      fieldTypes,
      roles: { roles: { admin: ["*"], editor: ["pages.*"] }, anonymous: ["media.read"] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules: moduleConfig, features, collections: contentTypes, collectionsUi, fieldTypes });
    const config = defineConfig({ modules: moduleConfig, triggers: preset.triggers, http: null });
    const bootedModules = presetModules(config.modules, { "@michaelthielemann/kestrel-insights": insights });
    const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines });
    await kestrel.start();

    const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
    if (login.status !== 200 || login.result === undefined || typeof login.result !== "object" || !("token" in login.result)) {
      throw new Error("expected the login run to produce a token");
    }
    const token = String(login.result.token);
    return { kestrel, token };
  }

  it("createUser: an unknown role name answers 400 VALIDATION with details.unknown and creates no user", async () => {
    const { kestrel, token } = await bootPreset();
    try {
      const before = await kestrel.run("listUsers", { trigger: { kind: "http", name: "GET /users" }, headers: { authorization: `Bearer ${token}` } });
      const countBefore = boundaryCast<UserRecord[]>(before.result, "host").length;

      const create = await kestrel.run("createUser", {
        trigger: { kind: "http", name: "POST /users" },
        headers: { authorization: `Bearer ${token}` },
        body: { username: "someone", password: "correct horse battery staple", roles: ["superadmin"] },
      });
      expect(create.status).toBe(400);
      expect(create.code).toBe("VALIDATION");
      if (create.details === undefined) throw new Error("expected VALIDATION details naming the unknown role");
      expect(create.details.unknown).toEqual(["superadmin"]);

      const after = await kestrel.run("listUsers", { trigger: { kind: "http", name: "GET /users" }, headers: { authorization: `Bearer ${token}` } });
      expect(boundaryCast<UserRecord[]>(after.result, "host").length).toBe(countBefore);
    } finally {
      await kestrel.stop();
    }
  });

  it("updateUser: an unknown role name answers 400 VALIDATION with details.unknown and leaves the user's roles unchanged", async () => {
    const { kestrel, token } = await bootPreset();
    try {
      const create = await kestrel.run("createUser", {
        trigger: { kind: "http", name: "POST /users" },
        headers: { authorization: `Bearer ${token}` },
        body: { username: "editor-one", password: "correct horse battery staple", roles: ["editor"] },
      });
      expect(create.status).toBe(200);
      const targetId = boundaryCast<UserRecord>(create.result, "host").id;

      const update = await kestrel.run("updateUser", {
        trigger: { kind: "http", name: "PATCH /users/:id" },
        headers: { authorization: `Bearer ${token}` },
        params: { id: targetId },
        body: { roles: ["madeup"] },
      });
      expect(update.status).toBe(400);
      expect(update.code).toBe("VALIDATION");
      if (update.details === undefined) throw new Error("expected VALIDATION details naming the unknown role");
      expect(update.details.unknown).toEqual(["madeup"]);

      const getUser = await kestrel.run("getUser", {
        trigger: { kind: "http", name: "GET /users/:id" },
        headers: { authorization: `Bearer ${token}` },
        params: { id: targetId },
      });
      expect(boundaryCast<UserRecord>(getUser.result, "host").roles).toEqual(["editor"]);
    } finally {
      await kestrel.stop();
    }
  });
});
