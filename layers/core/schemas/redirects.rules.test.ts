import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createValidator, type Validator } from "@michaelthielemann/kestrel-validate-jsonschema/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";

const root = dirname(fileURLToPath(import.meta.url));

let validator: Validator;

beforeAll(async () => {
  validator = await createValidator({ schemas: { "redirects.rules": "redirects.rules.json" }, maxDepth: 32, maxNodes: 20_000 }, root, silentLogger);
});

afterAll(() => {
  validator.close();
});

function check(value: unknown): boolean {
  return validator.check("redirects.rules", value).ok;
}

describe("redirects.rules schema", () => {
  it("accepts a wildcard rule", () => {
    expect(check([{ from: "/produkte/*-*", to: "/p/$1/$2", status: "301" }])).toBe(true);
  });

  it("refuses a from longer than 512 characters", () => {
    expect(check([{ from: `/${"a".repeat(511)}`, to: "/x" }])).toBe(true);
    expect(check([{ from: `/${"a".repeat(512)}`, to: "/x" }])).toBe(false);
  });

  it("refuses more than 1000 rules", () => {
    const rules = Array.from({ length: 1001 }, (_, i) => ({ from: `/old/${i}`, to: `/new/${i}` }));
    expect(check(rules.slice(0, 1000))).toBe(true);
    expect(check(rules)).toBe(false);
  });
});
