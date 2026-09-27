import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, createEvent, createRouter, eventHandler, toNodeListener } from "h3";
import { clientIpResolver, type Kestrel, type Route } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { clientIpOptions, guardAccess, parseAllowlist, type AccessRules, type ClientAddressPolicy } from "./utils/ip-allowlist";

const ROUTES: Route[] = [
  { method: "GET", segments: ["users"], pipeline: "listUsers" },
  { method: "GET", segments: ["me"], pipeline: "me" },
  { method: "GET", segments: ["pages"], pipeline: "listPages" },
  { method: "GET", segments: ["admin", "pages"], pipeline: "listAdminPages" },
];

const runner: Pick<Kestrel, "run" | "triggers"> = {
  run: (pipeline) => Promise.resolve({ runId: "run-1", status: 200, result: { pipeline } }),
  triggers: { http: ROUTES, events: [], crons: [] },
};

interface Access {
  admin?: string;
  site?: string;
  policy?: Partial<ClientAddressPolicy>;
}

function rules({ admin, site, policy }: Access): AccessRules {
  const full: ClientAddressPolicy = { trustProxy: false, proxyHops: 1, trustedHeader: "", trustedProxies: [], ...policy };
  return { admin: parseAllowlist(admin), site: parseAllowlist(site), resolve: clientIpResolver(clientIpOptions(full)) };
}

function nitroLikeApp(access: AccessRules): Server {
  const app = createApp();
  app.use(eventHandler((event) => guardAccess(event, access)));
  const router = createRouter({ preemptive: true });
  router.use("/api/**", eventHandler(createKestrelHandler(runner, { mountPath: "/api" })));
  router.use("/**", eventHandler(() => "page"));
  app.use(router);
  return createServer(toNodeListener(app));
}

let server: Server | undefined;
let socketDir: string | undefined;

async function closeServer(): Promise<void> {
  const open = server;
  server = undefined;
  if (open !== undefined) await new Promise<void>((resolve) => { open.closeAllConnections(); open.close(() => resolve()); });
}

afterEach(async () => {
  await closeServer();
  if (socketDir !== undefined) rmSync(socketDir, { recursive: true, force: true });
  socketDir = undefined;
});

type Target = { port: number } | { socketPath: string };

async function listenTcp(access: Access): Promise<Target> {
  server = nitroLikeApp(rules(access));
  const open = server;
  await new Promise<void>((resolve) => open.listen(0, "127.0.0.1", resolve));
  return { port: boundaryCast<AddressInfo>(open.address(), "host").port };
}

async function listenUnix(access: Access): Promise<Target> {
  socketDir = mkdtempSync(join(tmpdir(), "kestrel-web-access-"));
  const socketPath = join(socketDir, "nitro.sock");
  server = nitroLikeApp(rules(access));
  const open = server;
  await new Promise<void>((resolve) => open.listen(socketPath, resolve));
  return { socketPath };
}

function get(target: Target, path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const where = "port" in target ? { host: "127.0.0.1", port: target.port } : { socketPath: target.socketPath };
    const req = request({ ...where, path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("admin allowlist with the API adapter behind it", () => {
  it("classifies the path the adapter routes, so dot segments cannot leave the admin scope", async () => {
    const target = await listenTcp({ admin: "10.0.0.0/8" });
    expect(await get(target, "/api/pages")).toBe(200);
    expect(await get(target, "/api/users")).toBe(403);
    for (const path of ["/api/x/../users", "/api/pages/%2e%2e/users", "/api/pages/.%2e/me", "/api/./admin/pages", "/api/x/../admin/pages"]) {
      expect(await get(target, path), path).toBe(403);
    }
  });

  it("lets the adapter refuse dot segments inside the allowlist", async () => {
    const target = await listenTcp({ admin: "127.0.0.1" });
    expect(await get(target, "/api/users")).toBe(200);
    for (const path of ["/api/x/../users", "/api/pages/%2e%2e/users", "/api/./admin/pages"]) expect(await get(target, path), path).toBe(400);
  });
});

describe("client address for the allowlists", () => {
  it("ignores a forwarding header from a peer outside trustedProxies", async () => {
    const outside = await listenTcp({ admin: "10.0.0.0/8", policy: { trustedHeader: "x-real-ip", trustedProxies: ["192.0.2.1"] } });
    expect(await get(outside, "/api/users", { "x-real-ip": "10.9.9.9" })).toBe(403);
    await closeServer();
    const chain = await listenTcp({ admin: "10.0.0.0/8", policy: { trustProxy: true, trustedProxies: ["192.0.2.1"] } });
    expect(await get(chain, "/api/users", { "x-forwarded-for": "10.9.9.9" })).toBe(403);
  });

  it("reads the forwarding header of a trusted proxy, loopback by default", async () => {
    const target = await listenTcp({ admin: "10.0.0.0/8", policy: { trustedHeader: "x-real-ip" } });
    expect(await get(target, "/api/users", { "x-real-ip": "10.9.9.9" })).toBe(200);
    expect(await get(target, "/api/users", { "x-real-ip": "203.0.113.9" })).toBe(403);
  });

  it("refuses a trusted proxy's request without the trusted header, even with no allowlist set", async () => {
    const target = await listenTcp({ policy: { trustedHeader: "x-real-ip" } });
    expect(await get(target, "/")).toBe(403);
    expect(await get(target, "/api/pages")).toBe(403);
    expect(await get(target, "/", { "x-real-ip": "203.0.113.9" })).toBe(200);
  });
});

describe("allowlists on a Unix socket", () => {
  it("refuses every request when no header names the client", async () => {
    const target = await listenUnix({ admin: "10.0.0.0/8", site: "10.0.0.0/8" });
    for (const path of ["/", "/admin", "/api/users", "/api/pages"]) expect(await get(target, path), path).toBe(403);
  });

  it("admits by the trusted header the local proxy sets", async () => {
    const target = await listenUnix({ admin: "10.0.0.0/8", site: "10.0.0.0/8", policy: { trustedHeader: "x-real-ip" } });
    expect(await get(target, "/", { "x-real-ip": "10.1.2.3" })).toBe(200);
    expect(await get(target, "/api/users", { "x-real-ip": "10.1.2.3" })).toBe(200);
    expect(await get(target, "/api/users", { "x-real-ip": "203.0.113.9" })).toBe(403);
    expect(await get(target, "/")).toBe(403);
  });

  it("admits by X-Forwarded-For with trustProxy", async () => {
    const target = await listenUnix({ site: "10.0.0.0/8", policy: { trustProxy: true } });
    expect(await get(target, "/", { "x-forwarded-for": "203.0.113.9, 10.1.2.3" })).toBe(200);
    expect(await get(target, "/", { "x-forwarded-for": "10.1.2.3, 203.0.113.9" })).toBe(403);
  });
});

describe("in-process requests", () => {
  it("pass whatever the lists and the proxy policy say", () => {
    const access = rules({ admin: "10.0.0.0/8", site: "10.0.0.0/8", policy: { trustedHeader: "x-real-ip" } });
    const req = { url: "/api/users", method: "GET", headers: {}, socket: { __unenv__: {}, remoteAddress: "" } };
    const event = createEvent(boundaryCast<Parameters<typeof createEvent>[0]>(req, "host"), boundaryCast<Parameters<typeof createEvent>[1]>({}, "host"));
    expect(() => guardAccess(event, access)).not.toThrow();
  });
});
