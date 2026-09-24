import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataModel } from "./load";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

describe("loadDataModel", () => {
  it("reads shared/model.ts's contentModel: every field's localized flag, and the project's locales", async () => {
    const model = await loadDataModel(resolve(FIXTURES, "site-2.0"));
    expect(model?.locales).toEqual(["en"]);
    expect(model?.types.pages?.fields.title).toEqual({ localized: true });
    expect(model?.types.pages?.fields.slug).toEqual({ localized: true });
    expect(model?.types.redirects?.fields.rules).toEqual({ localized: false });
  });

  it("returns undefined when the project has no shared/model.ts", async () => {
    const model = await loadDataModel(resolve(FIXTURES, "does-not-exist"));
    expect(model).toBeUndefined();
  });
});
