import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { ADMIN_PASSWORD, bootPlaygroundPreset, type BootedPreset, type BootOptions } from "./__fixtures__/boot-preset";

const SECOND_PASSWORD = "correct horse battery";

interface TwoAdmins {
  preset: BootedPreset;
  first: { id: string; headers: Record<string, string> };
  second: { id: string; headers: Record<string, string> };
}

describe("the last-admin guard holds when two admins change each other at the same time", () => {
  let appRoot: string;
  let preset: BootedPreset | undefined;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "kestrel-web-last-admin-"));
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

  async function twoAdmins(options: BootOptions = {}): Promise<TwoAdmins> {
    preset = await bootPlaygroundPreset(appRoot, undefined, options);
    const headers = await preset.login("admin", ADMIN_PASSWORD);
    const me = boundaryCast<{ id: string }>((await preset.call("me", "GET /me", { headers })).result, "host");
    const created = await preset.call("createUser", "POST /users", { headers, body: { username: "second-admin", password: SECOND_PASSWORD, roles: ["admin"] } });
    expect(created.status).toBe(200);
    const id = boundaryCast<{ id: string }>(created.result, "host").id;
    return { preset, first: { id: me.id, headers }, second: { id, headers: await preset.login("second-admin", SECOND_PASSWORD) } };
  }

  async function activeAdmins(booted: BootedPreset, headers: Record<string, string>): Promise<number> {
    const users = boundaryCast<{ active: boolean; roles: string[] }[]>((await booted.call("listUsers", "GET /users", { headers })).result, "host");
    return users.filter((user) => user.active && user.roles.includes("admin")).length;
  }

  it("lets exactly one of two admins deactivate the other", async () => {
    const { preset: booted, first, second } = await twoAdmins();
    const [a, b] = await Promise.all([
      booted.call("deactivateUser", "POST /users/:id/deactivate", { headers: first.headers, params: { id: second.id } }),
      booted.call("deactivateUser", "POST /users/:id/deactivate", { headers: second.headers, params: { id: first.id } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.code, b.code].filter((code) => code !== undefined)).toEqual(["LAST_ADMIN"]);
    expect(await activeAdmins(booted, a.status === 200 ? first.headers : second.headers)).toBe(1);
  }, 60_000);

  it("lets exactly one of two admins take the admin role from the other", async () => {
    const { preset: booted, first, second } = await twoAdmins();
    const [a, b] = await Promise.all([
      booted.call("updateUser", "PATCH /users/:id", { headers: first.headers, params: { id: second.id }, body: { roles: ["editor"] } }),
      booted.call("updateUser", "PATCH /users/:id", { headers: second.headers, params: { id: first.id }, body: { roles: ["editor"] } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.code, b.code].filter((code) => code !== undefined)).toEqual(["LAST_ADMIN"]);
    expect(await activeAdmins(booted, a.status === 200 ? first.headers : second.headers)).toBe(1);
  }, 60_000);

  it.each([
    ["with the direct event bus", {}],
    ["with the eventsQueue feature", { features: ["eventsQueue"] }],
  ] satisfies [string, BootOptions][])("lets exactly one of two admins delete the other %s", async (_label, options) => {
    const { preset: booted, first, second } = await twoAdmins(options);
    const [a, b] = await Promise.all([
      booted.call("deleteUser", "DELETE /users/:id", { headers: first.headers, params: { id: second.id } }),
      booted.call("deleteUser", "DELETE /users/:id", { headers: second.headers, params: { id: first.id } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.code, b.code].filter((code) => code !== undefined)).toEqual(["LAST_ADMIN"]);
    expect(await activeAdmins(booted, a.status === 200 ? first.headers : second.headers)).toBe(1);
  }, 60_000);
});
