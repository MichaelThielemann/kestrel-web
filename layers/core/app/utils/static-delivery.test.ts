import { describe, expect, it } from "vitest";
import { isStaticDelivery } from "./static-delivery";

describe("isStaticDelivery on the server", () => {
  it("is false and reads no document", () => {
    expect(typeof globalThis.document).toBe("undefined");
    expect(isStaticDelivery()).toBe(false);
  });
});
