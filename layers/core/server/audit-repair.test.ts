import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isOk } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset } from "./__fixtures__/boot-preset";

interface AuditRow {
  event: string;
  identityId?: string;
  params?: Record<string, unknown>;
}

describe("retryAnonymizeAuditUser answers only for a user that no longer exists and records who ran it", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-audit-repair-"));
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

  async function setup() {
    preset = await bootPlaygroundPreset(appRoot);
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    const me = await preset.call("me", "GET /me", { headers });
    const adminId = boundaryCast<{ id: string }>(me.result, "host").id;
    const created = await preset.call("createUser", "POST /users", { headers, body: { username: "former", password: "correct horse battery staple", roles: ["editor"] } });
    expect(created.status).toBe(200);
    const userId = boundaryCast<{ id: string }>(created.result, "host").id;
    return { preset, headers, adminId, userId };
  }

  async function entries(event: string): Promise<AuditRow[]> {
    const persistence = preset?.kestrel.contracts.find(PERSISTENCE);
    if (persistence === undefined) throw new Error("expected the booted instance to provide persistence@1");
    const found = await persistence.findMany("audit_entries", { event });
    if (!isOk(found)) throw new Error("expected the audit query to succeed");
    return boundaryCast<AuditRow[]>(found.value.items, "host");
  }

  const retry = (run: BootedPreset["call"], headers: Record<string, string>, id: string) =>
    run("retryAnonymizeAuditUser", "POST /admin/users/:id/audit/anonymize", { headers, params: { id } });

  it("answers 409 for an active user and for a deactivated one, and records nothing", async () => {
    const { preset: booted, headers, adminId, userId } = await setup();
    const deactivated = await booted.call("deactivateUser", "POST /users/:id/deactivate", { headers, params: { id: userId } });
    expect(deactivated.status).toBe(200);

    for (const id of [adminId, userId]) {
      const run = await retry(booted.call, headers, id);
      expect(run.status, id).toBe(409);
    }
    expect(await entries("user.auditAnonymizeRetried")).toHaveLength(0);
  });

  it("answers 400 for an id that is not a UUID", async () => {
    const { preset: booted, headers } = await setup();
    const run = await retry(booted.call, headers, "former");
    expect(run.status).toBe(400);
    expect(await entries("user.auditAnonymizeRetried")).toHaveLength(0);
  });

  it("runs for a deleted user and records one entry that names the caller and not the user", async () => {
    const { preset: booted, headers, adminId, userId } = await setup();
    const removed = await booted.kestrel.contracts.find(PERSISTENCE)?.deleteOne("authn_users", userId);
    if (removed === undefined || !isOk(removed)) throw new Error("expected the account to be removed");

    const run = await retry(booted.call, headers, userId);
    expect(run.status).toBe(200);

    const recorded = await entries("user.auditAnonymizeRetried");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.identityId).toBe(adminId);
    expect(recorded[0]?.params ?? {}).toEqual({});
    expect(JSON.stringify(recorded[0])).not.toContain(userId);
  });
});
