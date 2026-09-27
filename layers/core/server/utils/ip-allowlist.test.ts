import { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { accessScope, isAllowed, isInProcess, listEntries, normalizeAddress, parseAllowlist, routedPath } from "./ip-allowlist";

describe("accessScope", () => {
  it("routes the admin UI, admin API, account routes and every write to the admin scope", () => {
    expect(accessScope("/admin", "GET")).toBe("admin");
    expect(accessScope("/admin/pages/1?locale=de", "GET")).toBe("admin");
    expect(accessScope("/api/admin/pages/1", "GET")).toBe("admin");
    expect(accessScope("/api/login", "POST")).toBe("admin");
    expect(accessScope("/api/me", "GET")).toBe("admin");
    expect(accessScope("/api/users", "GET")).toBe("admin");
    expect(accessScope("/api/pages", "POST")).toBe("admin");
    expect(accessScope("/api/pages/1", "DELETE")).toBe("admin");
  });

  it("leaves public pages, assets and anonymous reads in the site scope", () => {
    expect(accessScope("/", "GET")).toBe("site");
    expect(accessScope("/kontakt", "GET")).toBe("site");
    expect(accessScope("/_nuxt/a.js", "GET")).toBe("site");
    expect(accessScope("/api/site/kontakt", "GET")).toBe("site");
    expect(accessScope("/api/pages?limit=1", "GET")).toBe("site");
    expect(accessScope("/api/health", "GET")).toBe("site");
    expect(accessScope("/administrator", "GET")).toBe("site");
  });
});

describe("parseAllowlist / isAllowed", () => {
  it("is open when empty", () => {
    expect(parseAllowlist("")).toBeNull();
    expect(parseAllowlist(undefined)).toBeNull();
    expect(isAllowed(null, "203.0.113.9")).toBe(true);
  });

  it("matches IPv4 and IPv6 subnets and single addresses", () => {
    const list = parseAllowlist("203.0.113.0/24, 2001:db8::/32 10.0.0.5");
    expect(isAllowed(list, "203.0.113.200")).toBe(true);
    expect(isAllowed(list, "203.0.114.1")).toBe(false);
    expect(isAllowed(list, "2001:db8:1::42")).toBe(true);
    expect(isAllowed(list, "2001:db9::1")).toBe(false);
    expect(isAllowed(list, "10.0.0.5")).toBe(true);
    expect(isAllowed(list, "10.0.0.6")).toBe(false);
  });

  it("checks IPv4-mapped IPv6 addresses against the IPv4 entries", () => {
    const list = parseAllowlist("10.0.0.0/8");
    expect(normalizeAddress("::ffff:10.1.2.3")).toBe("10.1.2.3");
    expect(isAllowed(list, "::ffff:10.1.2.3")).toBe(true);
    expect(isAllowed(list, "::ffff:11.1.2.3")).toBe(false);
  });

  it("rejects unknown or missing addresses when a list is active", () => {
    const list = parseAllowlist("::1/128");
    expect(isAllowed(list, "::1")).toBe(true);
    expect(isAllowed(list, undefined)).toBe(false);
    expect(isAllowed(list, "not-an-ip")).toBe(false);
  });

  it("refuses invalid entries with the offending text", () => {
    expect(() => parseAllowlist("10.0.0.0/33")).toThrow(/invalid prefix in "10.0.0.0\/33"/);
    expect(() => parseAllowlist("example.org")).toThrow(/invalid entry "example.org"/);
    expect(() => parseAllowlist("10.0.0.0/8/x")).toThrow(/invalid entry/);
  });
});

describe("routedPath", () => {
  it("resolves literal and encoded dot segments and decodes each segment, as the API router does", () => {
    expect(routedPath("/api/x/../users")).toBe("/api/users");
    expect(routedPath("/api/pages/%2e%2e/users")).toBe("/api/users");
    expect(routedPath("/api/pages/.%2E/me")).toBe("/api/me");
    expect(routedPath("/api/./admin/pages")).toBe("/api/admin/pages");
    expect(routedPath("/api/%61dmin/pages?x=1")).toBe("/api/admin/pages");
    expect(routedPath("//api/users")).toBe("/api/users");
    expect(routedPath("/api/x\\..\\users")).toBe("/api/users");
    expect(routedPath("/kontakt/%zz")).toBe("/kontakt/%zz");
  });

  it("puts every resolved admin path into the admin scope", () => {
    for (const target of ["/api/x/../users", "/api/pages/%2e%2e/users", "/api/./admin/pages", "/api/pages/.%2e/me", "/x/../admin"]) {
      expect(accessScope(routedPath(target), "GET"), target).toBe("admin");
    }
  });
});

describe("isInProcess", () => {
  it("recognizes Nitro's in-process request socket, not a network socket", () => {
    expect(isInProcess(boundaryCast<Parameters<typeof isInProcess>[0]>({ socket: { __unenv__: {}, remoteAddress: "" } }, "host"))).toBe(true);
    expect(isInProcess({ socket: new Socket() })).toBe(false);
  });
});

describe("listEntries", () => {
  it("splits on commas and whitespace", () => {
    expect(listEntries(" 10.0.0.1, 10.0.0.0/8  ::1 ")).toEqual(["10.0.0.1", "10.0.0.0/8", "::1"]);
    expect(listEntries(undefined)).toEqual([]);
  });
});
