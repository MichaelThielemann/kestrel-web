import { describe, expect, it } from "vitest";
import type { ModuleLike } from "./modules";
import { uploadLimits } from "./limits";

const mediaSchema: ModuleLike["configSchema"] = {
  safeParse: (value) => {
    const raw = (typeof value === "object" && value !== null ? value : {}) as { maxBytes?: unknown };
    return { success: true, data: { maxBytes: 5242880, ...raw } };
  },
};

const media = (configSchema?: ModuleLike["configSchema"]): ModuleLike => ({
  name: "media/default",
  steps: () => ({ upload: () => undefined }),
  ...(configSchema ? { configSchema } : {}),
});

const sanitize: ModuleLike = { name: "sanitize/svg", steps: () => ({ svg: () => undefined }) };

describe("uploadLimits", () => {
  it("derives maxUploadBytes and maxBodyBytes from the module registering media.upload", () => {
    expect(uploadLimits([media(mediaSchema)], [{ use: "@michaelthielemann/kestrel-media-default", config: { maxBytes: 5242880 } }])).toEqual({
      maxUploadBytes: 5242880,
      maxBodyBytes: 5242880 + 1024 * 1024,
    });
  });

  it("works for any package name as long as the module registers the step", () => {
    expect(uploadLimits([media(mediaSchema)], [{ use: "@acme/cms-media-store", config: { maxBytes: 128 } }])).toEqual({
      maxUploadBytes: 128,
      maxBodyBytes: 128 + 1024 * 1024,
    });
  });

  it("falls back to the module schema default when the entry omits maxBytes", () => {
    expect(uploadLimits([media(mediaSchema)], [{ use: "@michaelthielemann/kestrel-media-default", config: {} }])).toEqual({
      maxUploadBytes: 5242880,
      maxBodyBytes: 5242880 + 1024 * 1024,
    });
  });

  it("returns unknown limits when no media module is configured", () => {
    expect(uploadLimits([sanitize], [{ use: "@michaelthielemann/kestrel-sanitize-svg", config: {} }])).toEqual({
      maxUploadBytes: null,
      maxBodyBytes: undefined,
    });
  });

  it("throws when a media module is configured but maxBytes cannot be determined", () => {
    expect(() => uploadLimits([media()], [{ use: "@michaelthielemann/kestrel-media-default", config: {} }])).toThrow(/maxBytes/);
    expect(() => uploadLimits([media()], [{ use: "@michaelthielemann/kestrel-media-default", config: { maxBytes: "5" } }])).toThrow(/maxBytes/);
  });
});
