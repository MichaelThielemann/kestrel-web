import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

interface EntryRow {
  event: string;
  at: number;
  identityId: string | null;
  ip: string | null;
  params: string;
}

describe("the audit log records sign-in failures, account changes, denials and rate limits", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-security-audit-"));
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

  async function entries(): Promise<Array<Omit<EntryRow, "params"> & { params: Record<string, string> }>> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const db = new DatabaseSync(join(appRoot, "kestrel.db"));
    try {
      const rows = boundaryCast<EntryRow[]>(db.prepare('SELECT "event", "at", "identityId", "ip", "params" FROM "audit_entries" ORDER BY "at"').all(), "host");
      return rows.map((row) => ({ ...row, params: boundaryCast<Record<string, string>>(JSON.parse(row.params), "json") }));
    } finally {
      db.close();
    }
  }

  it("records a failed sign-in with time, username and address, and no password", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const before = Date.now();
    const failed = await preset.call("login", "POST /login", { body: { username: "admin", password: "wrong horse" }, ip: "198.51.100.20" });
    expect(failed.status).toBe(401);
    const entry = (await entries()).find((row) => row.event === "auth.failed");
    expect(entry).toMatchObject({ ip: "198.51.100.20", params: { pipeline: "login", username: "admin" } });
    expect(entry?.at).toBeGreaterThanOrEqual(before);
    expect(JSON.stringify(entry)).not.toContain("wrong horse");
  }, 60_000);

  it("records creating, changing, deactivating and activating a user and setting or changing a password, each with actor and target", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const { call } = preset;
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    const me = boundaryCast<{ id: string }>((await call("me", "GET /me", { headers })).result, "host");
    const created = await call("createUser", "POST /users", { headers, body: { username: "target", password: "correct horse battery", roles: ["editor"] }, ip: "192.0.2.30" });
    const id = boundaryCast<{ id: string }>(created.result, "host").id;
    expect((await call("updateUser", "PATCH /users/:id", { headers, params: { id }, body: { roles: ["admin"] } })).status).toBe(200);
    expect((await call("setPassword", "PUT /users/:id/password", { headers, params: { id }, body: { password: "another passphrase" } })).status).toBe(200);
    expect((await call("deactivateUser", "POST /users/:id/deactivate", { headers, params: { id } })).status).toBe(200);
    expect((await call("activateUser", "POST /users/:id/activate", { headers, params: { id } })).status).toBe(200);
    const target = await preset.login("target", "another passphrase");
    const targetMe = boundaryCast<{ id: string }>((await call("me", "GET /me", { headers: target })).result, "host");
    expect((await call("changePassword", "POST /me/password", { headers: target, body: { currentPassword: "another passphrase", newPassword: "a third passphrase" } })).status).toBe(200);

    const found = await entries();
    for (const event of ["user.created", "user.updated", "user.passwordSet", "user.deactivated", "user.activated"]) {
      expect(found.find((row) => row.event === event), event).toMatchObject({ identityId: me.id, params: { id } });
    }
    expect(found.find((row) => row.event === "user.created")?.ip).toBe("192.0.2.30");
    expect(found.find((row) => row.event === "user.passwordChanged")).toMatchObject({ identityId: targetMe.id });
  }, 60_000);

  it("records a 403 and a 429 as structured entries with address and pipeline", async () => {
    preset = await bootPlaygroundPreset(appRoot);
    const { call } = preset;
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    expect((await call("createUser", "POST /users", { headers, body: { username: "editor-two", password: "correct horse battery", roles: ["editor"] } })).status).toBe(200);
    const editor = await preset.login("editor-two", "correct horse battery");
    expect((await call("listUsers", "GET /users", { headers: editor, ip: "203.0.113.40" })).status).toBe(403);
    let limited = 0;
    for (let i = 0; i < 10 && limited === 0; i++) {
      const run = await call("login", "POST /login", { body: { username: "nobody", password: "nothing at all" }, ip: "203.0.113.41" });
      if (run.status === 429) limited += 1;
    }
    expect(limited).toBe(1);
    const found = await entries();
    expect(found.find((row) => row.event === "access.denied")).toMatchObject({ ip: "203.0.113.40", params: { pipeline: "listUsers" } });
    expect(found.find((row) => row.event === "access.rateLimited")).toMatchObject({ ip: "203.0.113.41", params: { pipeline: "login", code: "RATE_LIMITED" } });
  }, 60_000);
});
