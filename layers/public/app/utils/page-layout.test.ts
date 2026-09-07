import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, resolvePageLayout } from "./page-layout";

describe("resolvePageLayout", () => {
  it("coalesces every empty form to the default layout", () => {
    for (const empty of [null, undefined, ""]) expect(resolvePageLayout(empty)).toBe(DEFAULT_LAYOUT);
  });

  it("passes a selected name through", () => {
    expect(resolvePageLayout("marketing")).toBe("marketing");
  });

  it("passes an unknown name through, leaving the miss to NuxtLayout fallback", () => {
    expect(resolvePageLayout("deleted-layout")).toBe("deleted-layout");
  });

  it("ignores a non-string value rather than rendering a broken layout name", () => {
    for (const bad of [42, {}, [], true]) expect(resolvePageLayout(bad as never)).toBe(DEFAULT_LAYOUT);
  });

  it("trims incidental whitespace", () => {
    expect(resolvePageLayout("  marketing  ")).toBe("marketing");
    expect(resolvePageLayout("   ")).toBe(DEFAULT_LAYOUT);
  });
});
