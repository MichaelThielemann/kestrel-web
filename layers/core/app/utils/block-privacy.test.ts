import { describe, expect, it } from "vitest";
import { withoutBlockAliases } from "./block-privacy";

describe("withoutBlockAliases", () => {
  it("removes the alias of a top-level block", () => {
    const body = [{ id: "b1", type: "hero", alias: "Intro teaser", props: {} }];
    expect(withoutBlockAliases(body)).toEqual([{ id: "b1", type: "hero", props: {} }]);
  });

  it("leaves a block without an alias untouched", () => {
    const body = [{ id: "b1", type: "hero", props: { heading: "Hi" } }];
    expect(withoutBlockAliases(body)).toEqual(body);
  });

  it("removes the alias of a block nested in a slot", () => {
    const body = [{ id: "p", type: "container", props: {}, slots: { items: [{ id: "c1", type: "hero", alias: "Nested", props: {} }] } }];
    expect(withoutBlockAliases(body)).toEqual([{ id: "p", type: "container", props: {}, slots: { items: [{ id: "c1", type: "hero", props: {} }] } }]);
  });

  it("keeps a non-block field literally named alias untouched", () => {
    const settings = { alias: "not a block", other: 1 };
    expect(withoutBlockAliases(settings)).toEqual(settings);
  });

  it("strips aliases anywhere inside a full page document", () => {
    const page = {
      id: "page-1",
      body: [{ id: "b1", type: "hero", alias: "Teaser", props: {} }],
      seo: { title: "Hello" },
    };
    expect(withoutBlockAliases(page)).toEqual({
      id: "page-1",
      body: [{ id: "b1", type: "hero", props: {} }],
      seo: { title: "Hello" },
    });
  });

  it("passes non-object values through unchanged", () => {
    expect(withoutBlockAliases(null)).toBe(null);
    expect(withoutBlockAliases("text")).toBe("text");
    expect(withoutBlockAliases(42)).toBe(42);
  });
});
