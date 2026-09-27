import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractionHash } from "@michaelthielemann/kestrel-references-default/impl";
import { createValidator, type Validator } from "@michaelthielemann/kestrel-validate-jsonschema/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";
import { boundaryCast } from "./app/utils/cast";
import { blockSchema } from "./block-schema";
import { SAFE_LINK_URL_PATTERN } from "./app/utils/link-url";
import type { SerializedBlock } from "./app/types/kestrel";

const root = dirname(fileURLToPath(import.meta.url));

const blocks: SerializedBlock[] = [
  {
    name: "gallery",
    fields: {
      images: { type: "media", required: false, unique: false, options: { multiple: true } },
      cover: { type: "media", required: false, unique: false },
      pages: { type: "relation", required: false, unique: false, relation: { collection: "pages", many: true } },
      author: { type: "relation", required: false, unique: false, relation: { collection: "authors", many: false } },
    },
  },
];

let validator: Validator;

beforeAll(async () => {
  validator = await createValidator({ schemas: { "pages.body": blockSchema([...blocks, linkBlock]) }, maxDepth: 32, maxNodes: 20_000 }, root, silentLogger);
});

afterAll(() => {
  validator.close();
});

const linkBlock: SerializedBlock = { name: "teaser", fields: { cta: { type: "link", required: false, unique: false } } };

function checkLink(cta: unknown): boolean {
  return validator.check("pages.body", [{ type: "teaser", props: { cta } }]).ok;
}

function check(props: Record<string, unknown>): boolean {
  return validator.check("pages.body", [{ type: "gallery", props }]).ok;
}

describe("blockSchema for media and relation fields", () => {
  it("accepts arrays of ids for a multiple media field and a multiple relation field", () => {
    expect(check({ images: ["media-1", "media-2"], pages: ["page-1", "page-2"] })).toBe(true);
  });

  it("accepts an empty array for a multiple field", () => {
    expect(check({ images: [], pages: [] })).toBe(true);
  });

  it("accepts a plain id string for a single media field and a single relation field", () => {
    expect(check({ cover: "media-1", author: "author-1" })).toBe(true);
  });

  it("rejects a string in the multiple media field", () => {
    expect(check({ images: "media-1" })).toBe(false);
  });

  it("rejects a string in the multiple relation field", () => {
    expect(check({ pages: "page-1" })).toBe(false);
  });

  it("rejects an array in the single media field", () => {
    expect(check({ cover: ["media-1"] })).toBe(false);
  });

  it("rejects an array in the single relation field", () => {
    expect(check({ author: ["author-1"] })).toBe(false);
  });
});

describe("blockSchema marks where ids of other documents live", () => {
  type Schema = Record<string, unknown>;
  const at = (schema: Schema, ...keys: string[]): Schema => keys.reduce<Schema>((node, key) => boundaryCast<Schema>(node[key], "json"), schema);
  const props = (schema: Schema, block: string): Schema => at(schema, "$defs", block, "properties", "props", "properties");
  const branch = (field: Schema): Schema => boundaryCast<Schema[]>(field.anyOf, "json")[0] ?? {};

  it("marks a single media field and every item of a multiple one as media ids", () => {
    const gallery = props(blockSchema(blocks), "gallery");
    expect(branch(at(gallery, "cover"))).toEqual({ type: "string", "x-kestrel-ref": "media" });
    expect(branch(at(gallery, "images"))).toEqual({ type: "array", items: { type: "string", "x-kestrel-ref": "media" } });
  });

  it("marks a relation field with the collection it points to, single and multiple", () => {
    const gallery = props(blockSchema(blocks), "gallery");
    expect(branch(at(gallery, "author"))).toEqual({ type: "string", "x-kestrel-ref": "authors" });
    expect(branch(at(gallery, "pages"))).toEqual({ type: "array", items: { type: "string", "x-kestrel-ref": "pages" } });
  });

  it("marks media fields inside a repeater", () => {
    const slides: SerializedBlock = {
      name: "slides",
      fields: { items: { type: "repeater", required: true, unique: false, options: { fields: { picture: { type: "media", required: true, unique: false } } } } },
    };
    const items = at(props(blockSchema([slides]), "slides"), "items");
    expect(at(items, "items", "properties", "picture")).toEqual({ type: "string", "x-kestrel-ref": "media" });
  });

  it("still validates marked fields like plain strings", () => {
    expect(check({ cover: "media-1", images: ["media-2"], author: "author-1", pages: ["page-1"] })).toBe(true);
  });
});

describe("blockSchema and the references index", () => {
  const model = { types: { pages: { kind: "multi" as const, fields: { body: { type: "json" as const } } } } };
  const hashOf = (schema: Record<string, unknown>): string => extractionHash({ targets: { media: { media: true }, pages: { content: "pages" } }, schemas: { "pages.body": { schema } } }, model);
  const unmarked = (schema: Record<string, unknown>): Record<string, unknown> => boundaryCast<Record<string, unknown>>(JSON.parse(JSON.stringify(schema).replaceAll(/,"x-kestrel-ref":"[a-z]+"/g, "")), "json");

  it("changes the extraction hash when only the markers change, so the next boot rebuilds the index", () => {
    const schema = blockSchema(blocks);
    expect(hashOf(schema)).not.toBe(hashOf(unmarked(schema)));
  });

  it("keeps the extraction hash for a change the walk does not read", () => {
    const schema = blockSchema(blocks);
    expect(hashOf({ ...schema, $comment: "regenerated" })).toBe(hashOf(schema));
  });
});

describe("blockSchema rejects an alias on the node itself", () => {
  it("rejects a block node carrying an alias key: it lives in the collection's blockAliases field instead", () => {
    expect(validator.check("pages.body", [{ type: "gallery", alias: "hero-teaser", props: {} }]).ok).toBe(false);
  });
});

describe("blockSchema for link fields", () => {
  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "\tjavascript:alert(1)", "data:text/html,<p>x</p>", "vbscript:msgbox(1)", "kontakt"])("rejects the external target %j", (url) => {
    expect(checkLink({ type: "external", url })).toBe(false);
  });

  it.each(["https://example.com", "HTTPS://example.com/a?b=1", "http://example.com", "mailto:team@example.com", "tel:+4930123", "/kontakt", "#top", "?page=2"])("accepts the external target %j", (url) => {
    expect(checkLink({ type: "external", url })).toBe(true);
  });

  it("accepts internal, email and tel links in their stored shape", () => {
    expect(checkLink({ type: "internal", collection: "pages", id: "1", hash: "team", label: "Team" })).toBe(true);
    expect(checkLink({ type: "email", email: "team@example.com" })).toBe(true);
    expect(checkLink({ type: "tel", tel: "+49 30 123" })).toBe(true);
    expect(checkLink(null)).toBe(true);
  });

  it("rejects a member the link field never stores", () => {
    expect(checkLink({ type: "internal", collection: "pages", id: "1", path: "/elsewhere" })).toBe(false);
    expect(checkLink({ type: "external", url: "https://example.com", href: "javascript:alert(1)" })).toBe(false);
  });

  it("uses the same target rule as the navigation schema", () => {
    const navigation = boundaryCast<{ $defs: { link: { oneOf: Array<{ properties: Record<string, { pattern?: string }> }> } } }>(
      JSON.parse(readFileSync(join(root, "schemas", "settings.navigation.json"), "utf8")),
      "json",
    );
    const external = navigation.$defs.link.oneOf.find((branch) => branch.properties.url !== undefined);
    expect(external?.properties.url?.pattern).toBe(SAFE_LINK_URL_PATTERN);
  });
});
