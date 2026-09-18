import { describe, expect, it } from "vitest";
import { BOOT_FAILED_MESSAGE, bootFailure } from "./boot-failure";

describe("bootFailure", () => {
  it("answers 503 with the state and the reason as data", () => {
    expect(bootFailure({ state: "failed", error: "persistence is unreachable" })).toEqual({
      statusCode: 503,
      statusMessage: BOOT_FAILED_MESSAGE,
      data: { state: "failed", error: "persistence is unreachable" },
    });
  });

  it("carries a state without a reason unchanged", () => {
    expect(bootFailure({ state: "booting" }).data).toEqual({ state: "booting" });
  });
});
