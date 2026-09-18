import { describe, expect, it } from "vitest";
import type { ModuleLike, StepOwnerLookup } from "./modules";
import { uploadLimits } from "./limits";

const mediaSchema: ModuleLike["configSchema"] = {
  safeParse: (value) => {
    const raw = (typeof value === "object" && value !== null ? value : {}) as { maxBytes?: unknown };
    return { success: true, data: { maxBytes: 5242880, ...raw } };
  },
};

const media = (configSchema?: ModuleLike["configSchema"]): ModuleLike => ({
  name: "media/default",
  ...(configSchema ? { configSchema } : {}),
});

const sanitize: ModuleLike = { name: "sanitize/svg" };

const kestrelFor = (owner: string | undefined): StepOwnerLookup => ({ steps: { owner: () => owner } });

describe("uploadLimits", () => {
  it("derives maxUploadBytes and maxBodyBytes from the module registering media.upload", () => {
    expect(uploadLimits(kestrelFor("media/default"), [media(mediaSchema)], [{ use: "@michaelthielemann/kestrel-media-default", config: { maxBytes: 5242880 } }])).toEqual({
      maxUploadBytes: 5242880,
      maxBodyBytes: 5242880 + 1024 * 1024,
    });
  });

  it("works for any package name as long as the module registers the step", () => {
    expect(uploadLimits(kestrelFor("media/default"), [media(mediaSchema)], [{ use: "@acme/cms-media-store", config: { maxBytes: 128 } }])).toEqual({
      maxUploadBytes: 128,
      maxBodyBytes: 128 + 1024 * 1024,
    });
  });

  it("falls back to the module schema default when the entry omits maxBytes", () => {
    expect(uploadLimits(kestrelFor("media/default"), [media(mediaSchema)], [{ use: "@michaelthielemann/kestrel-media-default", config: {} }])).toEqual({
      maxUploadBytes: 5242880,
      maxBodyBytes: 5242880 + 1024 * 1024,
    });
  });

  it("returns unknown limits when no media module is configured", () => {
    expect(uploadLimits(kestrelFor(undefined), [sanitize], [{ use: "@michaelthielemann/kestrel-sanitize-svg", config: {} }])).toEqual({
      maxUploadBytes: null,
      maxBodyBytes: undefined,
    });
  });

  it("throws when a media module is configured but maxBytes cannot be determined", () => {
    expect(() => uploadLimits(kestrelFor("media/default"), [media()], [{ use: "@michaelthielemann/kestrel-media-default", config: {} }])).toThrow(/maxBytes/);
    expect(() => uploadLimits(kestrelFor("media/default"), [media()], [{ use: "@michaelthielemann/kestrel-media-default", config: { maxBytes: "5" } }])).toThrow(/maxBytes/);
  });
});
