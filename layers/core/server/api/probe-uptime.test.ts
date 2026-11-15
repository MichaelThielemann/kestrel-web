import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../plugins/kestrel", () => ({
  getKestrelState: () => ({ state: "ready" }),
  getKestrel: () => Promise.resolve({ health: () => ({ ok: true, restartRequired: false, modules: [] }) }),
}));

vi.mock("../utils/ip-allowlist", () => ({
  probeBody: (_event: unknown, body: object) => body,
}));

type Handler = (event: unknown) => Promise<unknown>;

function isHandler(value: unknown): value is Handler {
  return typeof value === "function";
}

async function handlerOf(load: () => Promise<{ default: unknown }>): Promise<Handler> {
  const route = await load();
  if (!isHandler(route.default)) throw new Error("the route does not export a handler");
  return route.default;
}

describe("probe uptime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("defineEventHandler", (handler: Handler) => handler);
    vi.stubGlobal("setResponseStatus", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("counts /api/health and /api/ready from the start of the process, not from the first request to the route", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(42.7);
    const health = await handlerOf(() => import("./health.get"));
    const ready = await handlerOf(() => import("./ready.get"));

    expect(await health({})).toEqual({ ok: true, uptimeSeconds: 42 });
    expect(await ready({})).toEqual({ ready: true, uptimeSeconds: 42 });
  });

  it("answers HEAD on /api/health and /api/ready with the handler of the GET", async () => {
    vi.spyOn(process, "uptime").mockReturnValue(7);
    const healthHead = await handlerOf(() => import("./health.head"));
    const readyHead = await handlerOf(() => import("./ready.head"));

    expect(healthHead).toBe(await handlerOf(() => import("./health.get")));
    expect(readyHead).toBe(await handlerOf(() => import("./ready.get")));
    expect(await healthHead({})).toEqual({ ok: true, uptimeSeconds: 7 });
    expect(await readyHead({})).toEqual({ ready: true, uptimeSeconds: 7 });
  });
});
