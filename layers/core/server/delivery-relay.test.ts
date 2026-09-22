import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boot, defineConfig, isOk, type ModuleDefinition } from "@michaelthielemann/kestrel";
import { stepFactory, type Context } from "@michaelthielemann/kestrel/context";
import { ok } from "@michaelthielemann/kestrel/result";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import deliveryStatic from "@michaelthielemann/kestrel-delivery-static";
import rendererNuxt from "@michaelthielemann/kestrel-renderer-nuxt";
import insights from "@michaelthielemann/kestrel-insights";
import { presetModules } from "#kestrel/modules";
import { definePreset, presetModuleConfig } from "#kestrel/pipelines";
import type { Feature } from "#kestrel/pipelines";

interface RelayPipelineReport {
  event: string;
  pipeline: string;
  status: string;
  attempts: number;
  dead: boolean;
  error: string | null;
}

interface RelayReport {
  status: string;
  pipelines: RelayPipelineReport[];
}

function relayOf(result: unknown): RelayReport {
  const record = boundaryCast<{ _events?: RelayReport }>(result, "host");
  if (record._events === undefined) throw new Error("expected the response to carry _events");
  return record._events;
}

function deliveryStaticWithAlwaysFailingPublish(): ModuleDefinition {
  return {
    ...deliveryStatic,
    steps: (instance: unknown) => {
      const real = deliveryStatic.steps!(instance);
      return {
        ...real,
        publish: stepFactory((_type: string) => (ctx: Context) => Promise.resolve(ctx.fail("TRANSIENT", "forced failure for the delivery relay acceptance test"))),
      };
    },
  };
}

const rendererNuxtAlwaysSucceeding: ModuleDefinition = {
  ...rendererNuxt,
  setup: () => Promise.resolve({
    formats: () => ["html"],
    render: () => Promise.resolve(ok({ data: "<html><body>ok</body></html>", contentType: "text/html", extension: "html" })),
  }),
};

const PASSWORD_HASH = "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98";

describe("delivery is an event pipeline, delivered by events.relay", () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-delivery-relay-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  async function bootWithFailingPublish(withQueue: boolean) {
    const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
    const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
    const { default: fieldTypes } = await import("../../../playground/shared/field-types");
    const activeFeatures = (withQueue ? [...features, "eventsQueue"] : features) as readonly Feature[];

    const moduleConfig = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features: activeFeatures,
      collectionsUi,
      fieldTypes,
      audit: { retentionDays: 365 },
      roles: { roles: { admin: ["*"] }, anonymous: [] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules: moduleConfig, features: activeFeatures, collections: contentTypes, collectionsUi, fieldTypes });
    const config = defineConfig({ modules: moduleConfig, triggers: preset.triggers, http: null });
    const bootedModules = presetModules(config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-delivery-static": deliveryStaticWithAlwaysFailingPublish(),
      "@michaelthielemann/kestrel-renderer-nuxt": rendererNuxtAlwaysSucceeding,
    });
    const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines });
    await kestrel.start();

    const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
    if (login.status !== 200 || login.result === undefined || typeof login.result !== "object" || !("token" in login.result)) {
      throw new Error("expected the login run to produce a token");
    }
    const token = String(login.result.token);
    return { kestrel, token };
  }

  async function createDraftPage(kestrel: Awaited<ReturnType<typeof bootWithFailingPublish>>["kestrel"], token: string, slug: string) {
    return kestrel.run("createPage", {
      trigger: { kind: "http", name: "POST /pages" },
      headers: { authorization: `Bearer ${token}` },
      body: { locale: "de", slug, title: "Relay acceptance", status: "draft", body: [], accent: "#123456" },
    });
  }

  it("queue: a forced delivery.publish failure answers 200 with _events.status \"error\" naming publishPage, and stores the page, its revision and its index", async () => {
    const { kestrel, token } = await bootWithFailingPublish(true);
    try {
      const create = await createDraftPage(kestrel, token, "relay-queue-create");
      expect(create.status).toBe(200);
      const relay = relayOf(create.result);
      expect(relay.status).toBe("error");
      expect(relay.pipelines).toEqual([expect.objectContaining({ event: "page.created", pipeline: "publishPage", status: "error" })]);

      const persistence = kestrel.contracts.find(PERSISTENCE);
      if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");

      const pages = await persistence.findMany("pages", {});
      if (!isOk(pages)) throw new Error("expected the pages query to succeed");
      expect(pages.value.total).toBe(1);

      const revisions = await persistence.findMany("revisions_heads", { collection: "pages" });
      if (!isOk(revisions)) throw new Error("expected the revisions_heads query to succeed");
      expect(revisions.value.total).toBe(1);

      const referencesIndex = await persistence.findMany("references_index", { fromType: "pages" });
      if (!isOk(referencesIndex)) throw new Error("expected the references_index query to succeed");
      expect(referencesIndex.value.total).toBe(0);

      const queueRow = await persistence.findMany("events_queue", { name: "page.created", pipeline: "publishPage" });
      if (!isOk(queueRow)) throw new Error("expected the events_queue query to succeed");
      expect(queueRow.value.total).toBe(1);
      expect(queueRow.value.items[0]).toMatchObject({ state: "pending", attempts: 1 });
    } finally {
      await kestrel.stop();
    }
  }, 20000);

  it("retrying the dead-lettered delivery does not re-run the revision or the reference index", async () => {
    const { kestrel, token } = await bootWithFailingPublish(true);
    try {
      const create = await createDraftPage(kestrel, token, "relay-queue-retry");
      expect(create.status).toBe(200);

      const persistence = kestrel.contracts.find(PERSISTENCE);
      if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");

      const rows = await persistence.findMany("events_queue", { name: "page.created", pipeline: "publishPage" });
      if (!isOk(rows)) throw new Error("expected the events_queue query to succeed");
      const row = rows.value.items[0];
      if (row === undefined) throw new Error("expected one queued delivery row");

      const marked = await persistence.updateMany("events_queue", { id: row.id }, { state: "dead", attempts: 5, availableAt: Date.now() });
      if (!isOk(marked)) throw new Error("expected marking the row dead to succeed");

      const dead = await kestrel.run("eventsDead", {
        trigger: { kind: "http", name: "GET /admin/events/dead" },
        headers: { authorization: `Bearer ${token}` },
        query: { limit: 10 },
      });
      expect(dead.status).toBe(200);
      const deadItems = boundaryCast<{ items: { id: string, pipeline: string, runId: string }[] }>(dead.result, "host").items;
      expect(deadItems).toContainEqual(expect.objectContaining({ id: row.id, pipeline: "publishPage" }));
      expect(deadItems.find((item) => item.id === row.id)?.runId).not.toBe("");

      const revisionsBefore = await persistence.findMany("revisions_heads", { collection: "pages" });
      if (!isOk(revisionsBefore)) throw new Error("expected the revisions_heads query to succeed");
      const referencesBefore = await persistence.findMany("references_index", { fromType: "pages" });
      if (!isOk(referencesBefore)) throw new Error("expected the references_index query to succeed");

      const retried = await kestrel.run("eventsRetryOne", {
        trigger: { kind: "http", name: "POST /admin/events/dead/:id/retry" },
        headers: { authorization: `Bearer ${token}` },
        params: { id: row.id },
      });
      expect(retried.status).toBe(200);

      const revisionsAfter = await persistence.findMany("revisions_heads", { collection: "pages" });
      if (!isOk(revisionsAfter)) throw new Error("expected the revisions_heads query to succeed");
      const referencesAfter = await persistence.findMany("references_index", { fromType: "pages" });
      if (!isOk(referencesAfter)) throw new Error("expected the references_index query to succeed");

      expect(revisionsAfter.value.total).toBe(revisionsBefore.value.total);
      expect(referencesAfter.value.total).toBe(referencesBefore.value.total);
    } finally {
      await kestrel.stop();
    }
  }, 20000);

  it("direct: the same forced failure answers 200 with _events.status \"error\", dead: true, nothing to retry", async () => {
    const { kestrel, token } = await bootWithFailingPublish(false);
    try {
      const create = await createDraftPage(kestrel, token, "relay-direct-create");
      expect(create.status).toBe(200);
      const relay = relayOf(create.result);
      expect(relay.status).toBe("error");
      expect(relay.pipelines).toEqual([expect.objectContaining({ event: "page.created", pipeline: "publishPage", status: "error", dead: true })]);
    } finally {
      await kestrel.stop();
    }
  }, 20000);
});

describe("a delete is not served after the response, with a working relay", () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-delivery-relay-delete-"));
    process.env.KESTREL_APP_ROOT = appRoot;
    process.env.KESTREL_BLOCK_SCHEMA = fileURLToPath(new URL("../pipelines/__fixtures__/pages.body.json", import.meta.url));
  });

  afterEach(() => {
    delete process.env.KESTREL_APP_ROOT;
    delete process.env.KESTREL_BLOCK_SCHEMA;
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("removes the published output before DELETE answers, in the queue mode", async () => {
    const { contentModel, contentTypes, features } = await import("../../../playground/shared/model");
    const { default: collectionsUi } = await import("../../../playground/shared/collections-ui");
    const { default: fieldTypes } = await import("../../../playground/shared/field-types");
    const activeFeatures = [...features, "eventsQueue"] as readonly Feature[];

    const moduleConfig = presetModuleConfig({
      dataDir: appRoot,
      blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: resolve(appRoot, "blobs") } },
      model: contentModel,
      features: activeFeatures,
      collectionsUi,
      fieldTypes,
      audit: { retentionDays: 365 },
      roles: { roles: { admin: ["*"] }, anonymous: [] },
      bootstrap: { username: "admin", passwordHash: PASSWORD_HASH },
    });
    const preset = definePreset({ modules: moduleConfig, features: activeFeatures, collections: contentTypes, collectionsUi, fieldTypes });
    const config = defineConfig({ modules: moduleConfig, triggers: preset.triggers, http: null });
    const bootedModules = presetModules(config.modules, {
      "@michaelthielemann/kestrel-insights": insights,
      "@michaelthielemann/kestrel-renderer-nuxt": rendererNuxtAlwaysSucceeding,
    });
    const kestrel = await boot({ config: { ...config, http: null }, modules: bootedModules, pipelines: preset.pipelines });

    try {
      await kestrel.start();

      const login = await kestrel.run("login", { trigger: { kind: "http", name: "POST /login" }, body: { username: "admin", password: "change-me" } });
      if (login.status !== 200 || login.result === undefined || typeof login.result !== "object" || !("token" in login.result)) {
        throw new Error("expected the login run to produce a token");
      }
      const token = String(login.result.token);

      const create = await kestrel.run("createPage", {
        trigger: { kind: "http", name: "POST /pages" },
        headers: { authorization: `Bearer ${token}` },
        body: { locale: "de", slug: "relay-delete-published", title: "Relay delete acceptance", status: "published", body: [], accent: "#123456" },
      });
      expect(create.status).toBe(200);
      const created = boundaryCast<{ id: string }>(create.result, "host");
      const relay = relayOf(create.result);
      expect(relay.status).toBe("done");

      const statusBefore = await kestrel.run("pagePublishStatus", {
        trigger: { kind: "http", name: "GET /admin/publish-status/pages/:id" },
        headers: { authorization: `Bearer ${token}` },
        params: { id: created.id },
      });
      expect(statusBefore.status).toBe(200);
      expect(boundaryCast<{ state: string }[]>(statusBefore.result, "host")).toContainEqual(expect.objectContaining({ state: "live" }));

      const del = await kestrel.run("deletePage", {
        trigger: { kind: "http", name: "DELETE /pages/:id" },
        headers: { authorization: `Bearer ${token}` },
        params: { id: created.id },
      });
      expect(del.status).toBe(200);
      const delRelay = relayOf(del.result);
      expect(delRelay.status).toBe("done");

      const statusAfter = await kestrel.run("pagePublishStatus", {
        trigger: { kind: "http", name: "GET /admin/publish-status/pages/:id" },
        headers: { authorization: `Bearer ${token}` },
        params: { id: created.id },
      });
      expect(statusAfter.status).toBe(200);
      expect(boundaryCast<unknown[]>(statusAfter.result, "host")).toEqual([]);
    } finally {
      await kestrel.stop();
    }
  }, 20000);
});
