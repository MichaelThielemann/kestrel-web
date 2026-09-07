import { describe, expect, it } from "vitest";
import { accessScope, clientAddress, isAllowed, normalizeAddress, parseAllowlist } from "./ip-allowlist";

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

describe("clientAddress", () => {
  const sources = { socket: "10.0.0.2", forwardedFor: "203.0.113.9, 198.51.100.7, 10.0.0.3", trustedHeader: "192.0.2.44" };

  it("uses the socket peer unless a proxy is trusted", () => {
    expect(clientAddress(sources, { trustProxy: false, proxyHops: 1, trustedHeader: "" })).toBe("10.0.0.2");
  });

  it("counts X-Forwarded-For hops from the right, never the client-supplied left end", () => {
    expect(clientAddress(sources, { trustProxy: true, proxyHops: 1, trustedHeader: "" })).toBe("10.0.0.3");
    expect(clientAddress(sources, { trustProxy: true, proxyHops: 2, trustedHeader: "" })).toBe("198.51.100.7");
    expect(clientAddress(sources, { trustProxy: true, proxyHops: 3, trustedHeader: "" })).toBe("203.0.113.9");
    expect(clientAddress(sources, { trustProxy: true, proxyHops: 4, trustedHeader: "" })).toBeUndefined();
  });

  it("falls back to the socket when the proxy sent no chain", () => {
    expect(clientAddress({ ...sources, forwardedFor: undefined }, { trustProxy: true, proxyHops: 1, trustedHeader: "" })).toBe("10.0.0.2");
  });

  it("prefers a trusted edge header over everything else", () => {
    expect(clientAddress(sources, { trustProxy: true, proxyHops: 1, trustedHeader: "x-real-ip" })).toBe("192.0.2.44");
    expect(clientAddress({ ...sources, trustedHeader: undefined }, { trustProxy: true, proxyHops: 1, trustedHeader: "x-real-ip" })).toBeUndefined();
  });
});
