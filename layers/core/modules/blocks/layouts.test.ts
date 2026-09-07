import { describe, expect, it } from "vitest";
import { ADMIN_LAYOUT, offerableLayouts, renderLayoutRegistry } from "./layouts";

const map = (...entries: [string, string][]) => Object.fromEntries(entries.map(([name, file]) => [name, { name, file }]));

describe("offerableLayouts", () => {
  it("offers the consumer layouts plus default, sorted", () => {
    expect(offerableLayouts(map(
      ["marketing", "/p/app/layouts/marketing.vue"],
      ["default", "/p/app/layouts/default.vue"],
      ["bare", "/p/app/layouts/bare.vue"],
    ))).toEqual(["bare", "default", "marketing"]);
  });

  it("never offers the admin shell", () => {
    expect(offerableLayouts(map(
      ["default", "/e/layers/public/app/layouts/default.vue"],
      [ADMIN_LAYOUT, "/e/layers/admin/app/layouts/admin.vue"],
    ))).toEqual(["default"]);
  });

  it("keeps only .vue files", () => {
    expect(offerableLayouts(map(
      ["default", "/p/app/layouts/default.vue"],
      ["helper", "/p/app/layouts/helper.ts"],
    ))).toEqual(["default"]);
  });

  it("returns [] for an empty map", () => {
    expect(offerableLayouts({})).toEqual([]);
  });

  it("tolerates a malformed entry", () => {
    const dirty = { default: { name: "default", file: "/p/app/layouts/default.vue" }, broken: undefined };
    expect(offerableLayouts(dirty as never)).toEqual(["default"]);
  });
});

describe("renderLayoutRegistry", () => {
  it("renders a module body the client bundle can import", () => {
    expect(renderLayoutRegistry(["bare", "default"])).toBe('export const kestrelLayouts = ["bare","default"]\n');
  });

  it("renders an empty list without emitting undefined", () => {
    expect(renderLayoutRegistry([])).toBe("export const kestrelLayouts = []\n");
  });
});
