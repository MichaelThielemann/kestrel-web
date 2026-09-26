import { describe, expect, it } from "vitest";
import { siteModelProblem } from "./site-model";

const site = (config: unknown) => [{ use: "@michaelthielemann/kestrel-site-default", config }];

describe("siteModelProblem", () => {
  it("accepts a site-default that matches shared/model", () => {
    expect(siteModelProblem(site({ routes: { pages: { home: "home" } }, prefixPrimary: true }), { prefixPrimary: true, homeSlug: "home" })).toBeUndefined();
  });

  it("names a prefixPrimary that differs from shared/model's", () => {
    expect(siteModelProblem(site({ routes: { pages: { home: "home" } }, prefixPrimary: false }), { prefixPrimary: true, homeSlug: "home" })).toMatch(/prefixPrimary false but shared\/model has true/);
  });

  it("names a home slug that differs from shared/model's", () => {
    expect(siteModelProblem(site({ routes: { pages: { home: "home" } } }), { prefixPrimary: false, homeSlug: "start" })).toMatch(/serves "home" at the root but shared\/model's homeSlug is "start"/);
  });

  it("checks nothing without routed pages", () => {
    expect(siteModelProblem(site({}), { prefixPrimary: true, homeSlug: "start" })).toBeUndefined();
  });
});
