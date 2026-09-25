import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createValidator, type Validator } from "@michaelthielemann/kestrel-validate-jsonschema/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";
import { blockSchema } from "./block-schema";
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
  validator = await createValidator({ schemas: { "pages.body": blockSchema(blocks) }, maxDepth: 32, maxNodes: 20_000 }, root, silentLogger);
});

afterAll(() => {
  validator.close();
});

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
