import { describe, expect, it } from "vitest";
import { buildCapabilities } from "./admin-capabilities";

describe("buildCapabilities", () => {
  it("leaves out a pipeline the caller is denied", () => {
    const { global } = buildCapabilities({
      triggers: [{ method: "DELETE", path: "/users/:id", pipeline: "deleteUser" }],
      access: { deleteUser: "denied" },
      verbs: {},
    });
    expect(global.deleteUser).toBeUndefined();
  });

  it("keeps a pipeline whose access is unknown", () => {
    const { global } = buildCapabilities({
      triggers: [{ method: "POST", path: "/me/password", pipeline: "changePassword" }],
      access: { changePassword: "unknown" },
      verbs: {},
    });
    expect(global.changePassword).toEqual({ method: "POST", path: "/me/password" });
  });

  it("keeps a pipeline whose access is granted", () => {
    const { global } = buildCapabilities({
      triggers: [{ method: "GET", path: "/users", pipeline: "listUsers" }],
      access: { listUsers: "granted" },
      verbs: {},
    });
    expect(global.listUsers).toEqual({ method: "GET", path: "/users" });
  });

  it("leaves out a pipeline without an HTTP trigger", () => {
    const { global } = buildCapabilities({
      triggers: [],
      access: { cleanupSessions: "unknown" },
      verbs: {},
    });
    expect(global.cleanupSessions).toBeUndefined();
  });

  it("takes the first HTTP trigger of a pipeline with several", () => {
    const { global } = buildCapabilities({
      triggers: [
        { method: "GET", path: "/pages/:id", pipeline: "readPage" },
        { method: "GET", path: "/site/*path", pipeline: "readPage" },
      ],
      access: { readPage: "unknown" },
      verbs: {},
    });
    expect(global.readPage).toEqual({ method: "GET", path: "/pages/:id" });
  });

  it("never lists a collection's pipeline in the global map, even when it is denied", () => {
    const { global, collections } = buildCapabilities({
      triggers: [{ method: "DELETE", path: "/pages/:id", pipeline: "deletePage" }],
      access: { deletePage: "denied" },
      verbs: { pages: { delete: "deletePage" } },
    });
    expect(global.deletePage).toBeUndefined();
    expect(collections.pages?.delete).toBeUndefined();
  });

  it("places a claimed pipeline under its collection's verb when present", () => {
    const { global, collections } = buildCapabilities({
      triggers: [{ method: "PATCH", path: "/pages/:id", pipeline: "updatePage" }],
      access: { updatePage: "granted" },
      verbs: { pages: { update: "updatePage" } },
    });
    expect(global.updatePage).toBeUndefined();
    expect(collections.pages?.update).toEqual({ method: "PATCH", path: "/pages/:id" });
  });

  it("lists getSettings globally only when the model has no settings type", () => {
    const withoutSettingsType = buildCapabilities({
      triggers: [{ method: "GET", path: "/settings", pipeline: "getSettings" }],
      access: { getSettings: "unknown" },
      verbs: {},
    });
    expect(withoutSettingsType.global.getSettings).toEqual({ method: "GET", path: "/settings" });

    const withSettingsType = buildCapabilities({
      triggers: [{ method: "GET", path: "/settings", pipeline: "getSettings" }],
      access: { getSettings: "unknown" },
      verbs: { settings: { get: "getSettings" } },
    });
    expect(withSettingsType.global.getSettings).toBeUndefined();
    expect(withSettingsType.collections.settings?.get).toEqual({ method: "GET", path: "/settings" });
  });
});
