import { describe, expect, it } from "vitest";
import { layoutSelectOptions } from "./layouts";

describe("layoutSelectOptions", () => {
  const label = "Default";

  it("offers the fallback as one empty-valued entry, never a duplicate default", () => {
    expect(layoutSelectOptions(["bare", "default", "marketing"], label)).toEqual([
      { label, value: "" },
      { label: "bare", value: "bare" },
      { label: "marketing", value: "marketing" },
    ]);
  });

  it("collapses to the single fallback entry when default is all there is", () => {
    expect(layoutSelectOptions(["default"], label)).toEqual([{ label, value: "" }]);
  });

  it("yields only the fallback entry for an empty list", () => {
    expect(layoutSelectOptions([], label)).toEqual([{ label, value: "" }]);
  });
});
