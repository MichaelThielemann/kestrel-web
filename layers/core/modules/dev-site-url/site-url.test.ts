import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { DEV_SITE_URL_ENV, devSiteUrlEnv, listenOrigin } from "./site-url";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((done) => server.close(() => done()));
});

function portOf(server: Server): string {
  return String(boundaryCast<AddressInfo>(server.address(), "host").port);
}

async function listening(server: Server, host: string): Promise<Server> {
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, host, done));
  return server;
}

describe("listenOrigin", () => {
  it("takes the listener's url, protocol, host, port and base path included", () => {
    expect(listenOrigin(undefined, { url: "https://localhost:3443/site/" })).toBe("https://localhost:3443/site/");
    expect(listenOrigin(undefined, { url: "http://[::1]:4000/" })).toBe("http://[::1]:4000/");
  });

  it("falls back to the bound address: localhost for every interface, a bracketed IPv6 address, https for a TLS server", async () => {
    const any = await listening(createHttpServer(), "0.0.0.0");
    expect(listenOrigin(any, {})).toBe(`http://localhost:${portOf(any)}`);

    const loopback = await listening(createHttpServer(), "127.0.0.1");
    expect(listenOrigin(loopback, undefined)).toBe(`http://127.0.0.1:${portOf(loopback)}`);

    const secure = await listening(createHttpsServer(), "127.0.0.1");
    expect(listenOrigin(secure, { url: "" })).toBe(`https://127.0.0.1:${portOf(secure)}`);
  });

  it("brackets an IPv6 address and reads :: as localhost", () => {
    const at = (address: string) => ({ address: () => ({ address, family: "IPv6", port: 3456 }) });
    expect(listenOrigin(at("::1"), undefined)).toBe("http://[::1]:3456");
    expect(listenOrigin(at("::"), undefined)).toBe("http://localhost:3456");
  });

  it("answers undefined when neither the listener nor the server names an address", () => {
    expect(listenOrigin(undefined, undefined)).toBeUndefined();
    expect(listenOrigin({ address: () => null }, {})).toBeUndefined();
  });
});

describe("devSiteUrlEnv", () => {
  it("gives an unset or empty NUXT_PUBLIC_SITE_URL the normalised origin and records it", () => {
    const derived = { NUXT_PUBLIC_SITE_URL: "http://localhost:4123", [DEV_SITE_URL_ENV]: "http://localhost:4123" };
    expect(devSiteUrlEnv({}, "http://localhost:4123/")).toEqual(derived);
    expect(devSiteUrlEnv({ NUXT_PUBLIC_SITE_URL: "" }, "http://localhost:4123/")).toEqual(derived);
    expect(devSiteUrlEnv({}, "https://[::1]:4443/site/")).toEqual({ NUXT_PUBLIC_SITE_URL: "https://[::1]:4443/site", [DEV_SITE_URL_ENV]: "https://[::1]:4443/site" });
  });

  it("replaces the site URL it derived before, after a reload on another port", () => {
    const env = { NUXT_PUBLIC_SITE_URL: "http://localhost:4123", [DEV_SITE_URL_ENV]: "http://localhost:4123" };
    expect(devSiteUrlEnv(env, "http://localhost:4124/").NUXT_PUBLIC_SITE_URL).toBe("http://localhost:4124");
  });

  it("leaves a site URL set by hand alone", () => {
    expect(devSiteUrlEnv({ NUXT_PUBLIC_SITE_URL: "https://www.example.test" }, "http://localhost:4123/")).toEqual({});
    expect(devSiteUrlEnv({ NUXT_PUBLIC_SITE_URL: "https://www.example.test", [DEV_SITE_URL_ENV]: "http://localhost:4123" }, "http://localhost:4123/")).toEqual({});
  });

  it("sets nothing for an origin that is no site URL", () => {
    expect(devSiteUrlEnv({}, "not a url")).toEqual({});
  });
});
