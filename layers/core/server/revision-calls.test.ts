import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

describe("the revision routes accept the query the admin sends and refuse a body member in the query", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-revision-calls-"));
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

  async function pageWithTwoRevisions(): Promise<{ booted: BootedPreset; headers: Record<string, string>; id: string; first: string }> {
    const booted = await bootPlaygroundPreset(appRoot);
    preset = booted;
    const headers = await booted.login("admin", ADMIN_PASSWORD);
    const created = await booted.call("createPage", "POST /pages", {
      headers,
      body: { locale: "de", slug: "query-check", title: "First title", status: "draft", body: [], accent: "#123456" },
    });
    expect(created.status).toBe(200);
    const id = boundaryCast<{ id: string }>(created.result, "host").id;
    const updated = await booted.call("updatePage", "PATCH /pages/:id", { headers, params: { id }, query: { locale: "de" }, body: { locale: "de", title: "Second title" } });
    expect(updated.status).toBe(200);
    const listed = await booted.call("pageRevisions", "GET /admin/pages/:id/revisions", { headers, params: { id }, query: { locale: "de" } });
    expect(listed.status).toBe(200);
    const items = boundaryCast<{ items: { id: string; createdAt: number }[] }>(listed.result, "host").items;
    const first = [...items].sort((a, b) => a.createdAt - b.createdAt)[0]?.id;
    if (first === undefined) throw new Error("expected the page to have revisions");
    return { booted, headers, id, first };
  }

  it("restores a revision with the editor locale in the query", async () => {
    const { booted, headers, id, first } = await pageWithTwoRevisions();
    const restored = await booted.call("restorePageRevision", "POST /admin/pages/:id/revisions/:revisionId/restore", { headers, params: { id, revisionId: first }, query: { locale: "de" } });
    expect(restored.status).toBe(200);
    expect(boundaryCast<{ title: string }>(restored.result, "host").title).toBe("First title");
  }, 60_000);

  it("labels a revision with the label in the body and refuses it in the query", async () => {
    const { booted, headers, id, first } = await pageWithTwoRevisions();
    const trigger = "PATCH /admin/pages/:id/revisions/:revisionId";
    const labelled = await booted.call("labelPageRevision", trigger, { headers, params: { id, revisionId: first }, body: { label: "Before the relaunch" } });
    expect(labelled.status).toBe(200);
    expect(boundaryCast<{ label: string | null }>(labelled.result, "host").label).toBe("Before the relaunch");
    const inQuery = await booted.call("labelPageRevision", trigger, { headers, params: { id, revisionId: first }, query: { label: "Sneaked in" }, body: {} });
    expect(inQuery).toMatchObject({ status: 400, code: "VALIDATION" });
  }, 60_000);
});
