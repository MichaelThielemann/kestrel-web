import { describe, expect, it } from "vitest";
import { boundaryCast } from "#kestrel/cast";
import type { PageDocument, RedirectHit, SiteResponse } from "#kestrel-core/app/types/api";
import { isPageResponse, isRedirectResponse, redirectNavigation } from "./site-redirect";

const REDIRECT_STATUSES = [301, 302, 307, 308] as const;

function page(over: Partial<PageDocument> = {}): PageDocument {
  return {
    id: "p1",
    createdAt: 0,
    updatedAt: 0,
    slug: "about",
    title: "About",
    body: [],
    seo: null,
    status: "published",
    shareImage: null,
    layout: null,
    ...over,
  };
}

function hit(status: RedirectHit["status"], to = "/neu"): RedirectHit {
  return { to, status };
}

describe("isRedirectResponse", () => {
  it.each(REDIRECT_STATUSES)("is true for a redirect hit with status %d", (status) => {
    expect(isRedirectResponse({ redirect: hit(status) })).toBe(true);
  });

  it("is false for a page", () => {
    expect(isRedirectResponse(page())).toBe(false);
  });

  it("is false for a page whose model has a field named 'redirect'", () => {
    const withField = boundaryCast<SiteResponse>({ ...page(), redirect: "not a hit" }, "json");
    expect(isRedirectResponse(withField)).toBe(false);
  });

  it("is false for a shape that is neither a page nor a redirect hit", () => {
    expect(isRedirectResponse(boundaryCast<SiteResponse>({}, "json"))).toBe(false);
  });

  it.each([
    ["a string", "not a hit"],
    ["a hit without a target", { status: 301 }],
    ["a hit with a status that is not a redirect", { to: "/neu", status: 200 }],
  ])("is false for a redirect key holding %s", (_label, redirect) => {
    expect(isRedirectResponse(boundaryCast<SiteResponse>({ redirect }, "json"))).toBe(false);
  });
});

describe("isPageResponse", () => {
  it("is true for a page", () => {
    expect(isPageResponse(page())).toBe(true);
  });

  it("is false for a redirect hit", () => {
    expect(isPageResponse({ redirect: hit(301) })).toBe(false);
  });

  it("is false for a shape that is neither a page nor a redirect hit", () => {
    expect(isPageResponse(boundaryCast<SiteResponse>({}, "json"))).toBe(false);
  });
});

describe("redirectNavigation", () => {
  it.each(REDIRECT_STATUSES)("keeps the hit's status %d as the redirect code", (status) => {
    const [, options] = redirectNavigation(hit(status));
    expect(options.redirectCode).toBe(status);
  });

  it("replaces the history entry so back does not return to the old path", () => {
    const [, options] = redirectNavigation(hit(301));
    expect(options.replace).toBe(true);
  });

  it("treats an absolute http(s) target as external", () => {
    const [to, options] = redirectNavigation(hit(302, "https://example.com/x"));
    expect(to).toBe("https://example.com/x");
    expect(options.external).toBe(true);
  });

  it("treats a site-relative target as internal, not external", () => {
    const [, options] = redirectNavigation(hit(302, "/neu"));
    expect(options.external).toBe(false);
  });
});
