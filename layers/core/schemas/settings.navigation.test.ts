import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createValidator, type Validator } from "@michaelthielemann/kestrel-validate-jsonschema/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";

const root = dirname(fileURLToPath(import.meta.url));

let validator: Validator;

beforeAll(async () => {
  validator = await createValidator({ schemas: { "settings.navigation": "settings.navigation.json" }, maxDepth: 32, maxNodes: 20_000 }, root, silentLogger);
});

afterAll(() => {
  validator.close();
});

function check(value: unknown): boolean {
  return validator.check("settings.navigation", value).ok;
}

describe("settings.navigation schema", () => {
  it("accepts a minimal internal link", () => {
    expect(check([{ label: "Home", link: { type: "internal", collection: "pages", id: "1" } }])).toBe(true);
  });

  it("accepts an internal link with hash and label", () => {
    expect(check([{ label: "Home", link: { type: "internal", collection: "pages", id: "1", hash: "section", label: "Home page" } }])).toBe(true);
  });

  it("accepts a minimal external link", () => {
    expect(check([{ label: "Docs", link: { type: "external", url: "https://example.com" } }])).toBe(true);
  });

  it("accepts an external link with label", () => {
    expect(check([{ label: "Docs", link: { type: "external", url: "https://example.com", label: "External docs" } }])).toBe(true);
  });

  it("accepts an item with target", () => {
    expect(check([{ label: "Docs", link: { type: "external", url: "https://example.com" }, target: "_blank" }])).toBe(true);
  });

  it("accepts one level of children", () => {
    expect(
      check([
        {
          label: "Products",
          link: { type: "internal", collection: "pages", id: "1" },
          children: [{ label: "Widgets", link: { type: "internal", collection: "pages", id: "2" } }],
        },
      ]),
    ).toBe(true);
  });

  it("rejects link: null", () => {
    expect(check([{ label: "Home", link: null }])).toBe(false);
  });

  it('rejects link: "x"', () => {
    expect(check([{ label: "Home", link: "x" }])).toBe(false);
  });

  it("rejects a resolved link (extra path property)", () => {
    expect(check([{ label: "Home", link: { type: "internal", collection: "pages", id: "1", path: "/home" } }])).toBe(false);
  });

  it("rejects a resolved link marked broken", () => {
    expect(check([{ label: "Home", link: { type: "internal", collection: "pages", id: "1", broken: true } }])).toBe(false);
  });

  it("rejects a grandchild level of children", () => {
    expect(
      check([
        {
          label: "Products",
          link: { type: "internal", collection: "pages", id: "1" },
          children: [
            {
              label: "Widgets",
              link: { type: "internal", collection: "pages", id: "2" },
              children: [{ label: "Too deep", link: { type: "internal", collection: "pages", id: "3" } }],
            },
          ],
        },
      ]),
    ).toBe(false);
  });

  it("rejects an unknown key on an item", () => {
    expect(check([{ label: "Home", link: { type: "internal", collection: "pages", id: "1" }, icon: "home" }])).toBe(false);
  });

  it("rejects an unsupported target value", () => {
    expect(check([{ label: "Home", link: { type: "internal", collection: "pages", id: "1" }, target: "_top" }])).toBe(false);
  });

  it("rejects an item missing label", () => {
    expect(check([{ link: { type: "internal", collection: "pages", id: "1" } }])).toBe(false);
  });

  it("rejects an item missing link", () => {
    expect(check([{ label: "Home" }])).toBe(false);
  });
});
