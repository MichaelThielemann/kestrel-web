import { afterEach, describe, expect, it } from "vitest";
import { isStaticDelivery } from "./static-delivery";

afterEach(() => {
  document.documentElement.removeAttribute("data-kestrel-delivery");
});

describe("isStaticDelivery in the browser", () => {
  it("is false on a page without the delivery attribute", () => {
    expect(isStaticDelivery()).toBe(false);
  });

  it("is true on a page whose <html> is marked static", () => {
    document.documentElement.setAttribute("data-kestrel-delivery", "static");
    expect(isStaticDelivery()).toBe(true);
  });

  it("is false for any other delivery value", () => {
    document.documentElement.setAttribute("data-kestrel-delivery", "live");
    expect(isStaticDelivery()).toBe(false);
  });
});
