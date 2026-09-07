import { describe, expect, it } from "vitest";
import type { ModuleLike } from "./modules";
import { inlineTypesFor } from "./inline-types";

const media: ModuleLike = { name: "media/default", steps: () => ({ upload: () => undefined }) };
const sanitize: ModuleLike = { name: "sanitize/svg", steps: () => ({ svg: () => undefined }) };

describe("inlineTypesFor", () => {
  it("inlines svg only when a module registers the sanitize.svg step", () => {
    expect(inlineTypesFor([media])).toEqual([]);
    expect(inlineTypesFor([media, sanitize])).toEqual(["image/svg+xml"]);
  });
});
