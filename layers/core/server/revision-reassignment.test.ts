import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boot, defineConfig, isOk } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import { EVENTS } from "@michaelthielemann/kestrel-contracts/events";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";

const PASSWORD_HASH = "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

interface UserRecord {
  id: string;
  username: string;
}

interface PageRecord {
  id: string;
}

interface ReassignResult {
  from: string;
  to: { id: string; name: string } | null;
  revisions: number;
}

describe("reassignRevisionAuthor and retryReassignRevisionAuthor verify the target before reassigning", () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-revision-reassignment-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  async function bootWithPage() {
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
    const headers = { authorization: `Bearer ${token}` };

    const me = await kestrel.run("me", { trigger: { kind: "http", name: "GET /me" }, headers });
    const adminId = boundaryCast<{ id: string }>(me.result, "host").id;

    const author = await kestrel.run("createUser", {
      trigger: { kind: "http", name: "POST /users" },
      headers,
      body: { username: "author", password: "correct horse battery staple", roles: ["editor"] },
    });
    if (author.status !== 200) throw new Error(`expected createUser to succeed, got ${author.status}`);
    const vanishedId = boundaryCast<UserRecord>(author.result, "host").id;
    const authorLogin = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "author", password: "correct horse battery staple" } });
    const authorHeaders = { authorization: `Bearer ${String(boundaryCast<{ token: string }>(authorLogin.result, "host").token)}` };

    const create = await kestrel.run("createPage", {
      trigger: { kind: "http", name: "POST /pages" },
      headers: authorHeaders,
      body: { locale: "de", slug: "reassignment-acceptance", title: "Reassignment acceptance", status: "draft", body: [], accent: "#123456" },
    });
    if (create.status !== 200) throw new Error(`expected createPage to succeed, got ${create.status}`);
    const pageId = boundaryCast<PageRecord>(create.result, "host").id;

    const persistence = kestrel.contracts.find(PERSISTENCE);
    if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");
    const removed = await persistence.deleteOne("authn_users", vanishedId);
    if (!isOk(removed)) throw new Error("expected the author's account to be removed");

    return { kestrel, headers, adminId, vanishedId, pageId };
  }

  async function authorIdsFor(kestrel: Awaited<ReturnType<typeof bootWithPage>>["kestrel"], documentId: string): Promise<(string | null)[]> {
    const persistence = kestrel.contracts.find(PERSISTENCE);
    if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");
    const entries = await persistence.findMany("revisions_entries", { documentId });
    if (!isOk(entries)) throw new Error("expected the revisions_entries query to succeed");
    const items = boundaryCast<{ authorId: string | null }[]>(entries.value.items, "host");
    return items.map((item) => item.authorId);
  }

  it("retryReassignRevisionAuthor: an unknown target id is rejected and no revision is touched", async () => {
    const { kestrel, headers, vanishedId, pageId } = await bootWithPage();
    try {
      const before = await authorIdsFor(kestrel, pageId);

      const reassign = await kestrel.run("retryReassignRevisionAuthor", {
        trigger: { kind: "http", name: "POST /admin/users/:id/revisions/reassign" },
        headers,
        params: { id: vanishedId },
        body: { reassignTo: "not-a-real-user-id" },
      });
      expect(reassign.status).toBe(404);

      expect(await authorIdsFor(kestrel, pageId)).toEqual(before);
    } finally {
      await kestrel.stop();
    }
  });

  it("retryReassignRevisionAuthor: an inactive target is rejected and no revision is touched", async () => {
    const { kestrel, headers, vanishedId, pageId } = await bootWithPage();
    try {
      const createTarget = await kestrel.run("createUser", {
        trigger: { kind: "http", name: "POST /users" },
        headers,
        body: { username: "editor-inactive", password: "correct horse battery staple", roles: [] },
      });
      expect(createTarget.status).toBe(200);
      const targetId = boundaryCast<UserRecord>(createTarget.result, "host").id;

      const deactivate = await kestrel.run("deactivateUser", {
        trigger: { kind: "http", name: "POST /users/:id/deactivate" },
        headers,
        params: { id: targetId },
      });
      expect(deactivate.status).toBe(200);

      const before = await authorIdsFor(kestrel, pageId);

      const reassign = await kestrel.run("retryReassignRevisionAuthor", {
        trigger: { kind: "http", name: "POST /admin/users/:id/revisions/reassign" },
        headers,
        params: { id: vanishedId },
        body: { reassignTo: targetId },
      });
      expect(reassign.status).toBe(400);

      expect(await authorIdsFor(kestrel, pageId)).toEqual(before);
    } finally {
      await kestrel.stop();
    }
  });

  it("retryReassignRevisionAuthor: a valid target is reassigned with its canonical name, ignoring a caller-supplied name", async () => {
    const { kestrel, headers, vanishedId, pageId } = await bootWithPage();
    try {
      const createTarget = await kestrel.run("createUser", {
        trigger: { kind: "http", name: "POST /users" },
        headers,
        body: { username: "editor-canonical", password: "correct horse battery staple", roles: [] },
      });
      expect(createTarget.status).toBe(200);
      const targetId = boundaryCast<UserRecord>(createTarget.result, "host").id;

      const reassign = await kestrel.run("retryReassignRevisionAuthor", {
        trigger: { kind: "http", name: "POST /admin/users/:id/revisions/reassign" },
        headers,
        params: { id: vanishedId },
        body: { reassignTo: { id: targetId, name: "not the real name" } },
      });
      expect(reassign.status).toBe(200);
      const result = boundaryCast<ReassignResult>(reassign.result, "host");
      expect(result.to).toEqual({ id: targetId, name: "editor-canonical" });

      expect(await authorIdsFor(kestrel, pageId)).toEqual([targetId]);
    } finally {
      await kestrel.stop();
    }
  });

  it("retryReassignRevisionAuthor: an id that still names a user, active or deactivated, is answered 409 and no revision is touched", async () => {
    const { kestrel, headers, adminId, pageId } = await bootWithPage();
    try {
      const createTarget = await kestrel.run("createUser", {
        trigger: { kind: "http", name: "POST /users" },
        headers,
        body: { username: "editor-former", password: "correct horse battery staple", roles: [] },
      });
      const formerId = boundaryCast<UserRecord>(createTarget.result, "host").id;
      const deactivate = await kestrel.run("deactivateUser", { trigger: { kind: "http", name: "POST /users/:id/deactivate" }, headers, params: { id: formerId } });
      expect(deactivate.status).toBe(200);
      const before = await authorIdsFor(kestrel, pageId);

      for (const id of [adminId, formerId]) {
        const reassign = await kestrel.run("retryReassignRevisionAuthor", {
          trigger: { kind: "http", name: "POST /admin/users/:id/revisions/reassign" },
          headers,
          params: { id },
          body: { reassignTo: adminId === id ? formerId : adminId },
        });
        expect(reassign.status, id).toBe(409);
      }
      expect(await authorIdsFor(kestrel, pageId)).toEqual(before);
    } finally {
      await kestrel.stop();
    }
  });

  it("retryReassignRevisionAuthor: an id that is no user id is answered 400", async () => {
    const { kestrel, headers, adminId } = await bootWithPage();
    try {
      const reassign = await kestrel.run("retryReassignRevisionAuthor", {
        trigger: { kind: "http", name: "POST /admin/users/:id/revisions/reassign" },
        headers,
        params: { id: "admin" },
        body: { reassignTo: adminId },
      });
      expect(reassign.status).toBe(400);
    } finally {
      await kestrel.stop();
    }
  });

  it("a repair of a vanished user's revisions is recorded in the audit log with the caller and without the user's id", async () => {
    const { kestrel, headers, adminId, vanishedId } = await bootWithPage();
    try {
      const reassign = await kestrel.run("retryReassignRevisionAuthor", {
        trigger: { kind: "http", name: "POST /admin/users/:id/revisions/reassign" },
        headers,
        params: { id: vanishedId },
        body: { reassignTo: adminId },
      });
      expect(reassign.status).toBe(200);

      const persistence = kestrel.contracts.find(PERSISTENCE);
      if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");
      const entries = await persistence.findMany("audit_entries", { event: "user.revisionsReassignRetried" });
      if (!isOk(entries)) throw new Error("expected the audit query to succeed");
      const items = boundaryCast<{ identityId?: string; params?: Record<string, unknown> }[]>(entries.value.items, "host");
      expect(items).toHaveLength(1);
      expect(items[0]?.identityId).toBe(adminId);
      expect(JSON.stringify(items[0])).not.toContain(vanishedId);
    } finally {
      await kestrel.stop();
    }
  });

  it("reassignRevisionAuthor (the user.deleted listener): an unknown target in the event hand-over is rejected and no revision is touched", async () => {
    const { kestrel, pageId } = await bootWithPage();
    try {
      const before = await authorIdsFor(kestrel, pageId);

      const reassign = await kestrel.run("reassignRevisionAuthor", {
        trigger: { kind: "event", name: "user.deleted" },
        payload: { result: { reassignTo: "not-a-real-user-id" } },
      });
      expect(reassign.status).toBe(404);

      expect(await authorIdsFor(kestrel, pageId)).toEqual(before);
    } finally {
      await kestrel.stop();
    }
  });

  it("a user.deleted event whose reassignment target is gone by the time the listener runs is counted as a failed delivery and shows up among recent failures", async () => {
    const { kestrel, headers, pageId } = await bootWithPage();
    try {
      const before = await authorIdsFor(kestrel, pageId);

      const events = kestrel.contracts.find(EVENTS);
      if (events === undefined) throw new Error("expected the booted instance to provide events@1");
      const vanished = randomUUID();
      await events.emit("user.deleted", { id: vanished, result: { reassignTo: vanished } });

      const status = await kestrel.run("eventsDeliveryStatus", { trigger: { kind: "http", name: "GET /admin/events/delivery" }, headers });
      expect(status.status).toBe(200);
      expect(boundaryCast<{ dead: number, scope: string }>(status.result, "host")).toMatchObject({ dead: 1, scope: "process" });

      const stats = await kestrel.run("insightsStats", { trigger: { kind: "http", name: "GET /admin/insights/stats" }, headers });
      expect(stats.status).toBe(200);
      const recentFailures = boundaryCast<{ recentFailures?: { pipeline: string, code?: string, step?: string }[] }>(stats.result, "host").recentFailures ?? [];
      expect(recentFailures).toContainEqual(expect.objectContaining({ pipeline: "reassignRevisionAuthor", code: "NOT_FOUND", step: "authn.verifyUser:result.reassignTo" }));

      expect(await authorIdsFor(kestrel, pageId)).toEqual(before);
    } finally {
      await kestrel.stop();
    }
  });
});
