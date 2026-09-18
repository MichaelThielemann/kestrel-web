import { describe, expect, it } from "vitest";
import type { ModuleLike, StepOwnerLookup } from "./modules";
import { inlineTypesFor } from "./inline-types";

const media: ModuleLike = { name: "media/default" };
const sanitize: ModuleLike = { name: "sanitize/svg" };

const kestrelFor = (owner: string | undefined): StepOwnerLookup => ({ steps: { owner: () => owner } });

describe("inlineTypesFor", () => {
  it("inlines svg only when a module registers the sanitize.svg step", () => {
    expect(inlineTypesFor(kestrelFor(undefined), [media])).toEqual([]);
    expect(inlineTypesFor(kestrelFor("sanitize/svg"), [media, sanitize])).toEqual(["image/svg+xml"]);
  });
});
