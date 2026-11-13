import type { TriggerConfig } from "@michaelthielemann/kestrel/defineConfig";
import { describe, expect, it } from "vitest";
import { checkPreset, definePreset, staticPipelineNames } from "./index";
import type { Feature, Preset } from "./index";

const MEDIA = "@michaelthielemann/kestrel-media-default";

type ModuleList = { use: string; config?: unknown }[];

function modulesFor(features: readonly Feature[], media: { use: string; config?: unknown } = { use: MEDIA, config: { trashRetentionDays: 30 } }): ModuleList {
  const modules: ModuleList = [
    { use: "@michaelthielemann/kestrel-authn-multi" },
    { use: "@michaelthielemann/kestrel-authz-roles" },
    { use: "@michaelthielemann/kestrel-content-default" },
    { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
    media,
    { use: "@michaelthielemann/kestrel-events-inmemory" },
    { use: "@michaelthielemann/kestrel-events-direct" },
  ];
  if (features.includes("images")) modules.push({ use: "@michaelthielemann/kestrel-images-default" });
  if (features.includes("references")) modules.push({ use: "@michaelthielemann/kestrel-references-default" });
  return modules;
}

const TRASH_PIPELINES = ["trashMedia", "trashMediaFolder", "restoreMedia", "listMediaTrash", "purgeMedia", "emptyMediaTrash", "purgeExpiredMedia"];

function stepsOf(preset: Preset, name: string): unknown {
  return preset.pipelines.find((pipeline) => pipeline.name === name)?.steps;
}

function triggersOf(preset: Preset, pipeline: string): TriggerConfig[] {
  return preset.triggers.filter((trigger) => trigger.pipeline === pipeline);
}

describe("media trash pipelines", () => {
  it("composes the trash pipelines when media-default carries trashRetentionDays", () => {
    const preset = definePreset({ modules: modulesFor([]), features: [] });
    expect(stepsOf(preset, "trashMedia")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.trash", "events.emit:media.trashed", "events.relay"]);
    expect(stepsOf(preset, "trashMediaFolder")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.trashFolder", "events.emit:media.trashed", "events.relay"]);
    expect(stepsOf(preset, "restoreMedia")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.write", "media.restore", "events.emit:media.restored", "events.relay"]);
    expect(stepsOf(preset, "listMediaTrash")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.write", "media.listTrash"]);
    expect(stepsOf(preset, "purgeMedia")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.selectTrash", "media.purge", "events.emit:media.deleted", "events.relay"]);
    expect(stepsOf(preset, "emptyMediaTrash")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.selectAllTrash", "media.purge", "events.emit:media.deleted", "events.relay"]);
    expect(stepsOf(preset, "purgeExpiredMedia")).toEqual(["media.selectExpiredTrash", "media.purge", "events.emit:media.deleted", "events.relay"]);
  });

  it("routes the trash under /media/trash and empties expired items every night at four", () => {
    const preset = definePreset({ modules: modulesFor([]), features: [] });
    expect(triggersOf(preset, "listMediaTrash")).toEqual([{ http: "GET /media/trash", pipeline: "listMediaTrash" }]);
    expect(triggersOf(preset, "trashMedia")).toEqual([{ http: "POST /media/trash", pipeline: "trashMedia" }]);
    expect(triggersOf(preset, "trashMediaFolder")).toEqual([{ http: "POST /media/trash/folders/*path", pipeline: "trashMediaFolder" }]);
    expect(triggersOf(preset, "restoreMedia")).toEqual([{ http: "POST /media/trash/restore", pipeline: "restoreMedia" }]);
    expect(triggersOf(preset, "purgeMedia")).toEqual([{ http: "POST /media/trash/purge", pipeline: "purgeMedia" }]);
    expect(triggersOf(preset, "emptyMediaTrash")).toEqual([{ http: "POST /media/trash/empty", pipeline: "emptyMediaTrash" }]);
    expect(triggersOf(preset, "purgeExpiredMedia")).toEqual([{ cron: "0 4 * * *", pipeline: "purgeExpiredMedia" }]);
  });

  it("lists the trash routes before GET /media/:id", () => {
    const preset = definePreset({ modules: modulesFor([]), features: [] });
    const http = preset.triggers.flatMap((trigger) => ("http" in trigger ? [trigger.http] : []));
    expect(http.indexOf("GET /media/trash")).toBeLessThan(http.indexOf("GET /media/:id"));
  });

  it("composes none of them, and no route or cron, without trashRetentionDays", () => {
    const preset = definePreset({ modules: modulesFor([], { use: MEDIA }), features: [] });
    const names = new Set(preset.pipelines.map((pipeline) => pipeline.name));
    for (const name of TRASH_PIPELINES) {
      expect(names.has(name), name).toBe(false);
      expect(triggersOf(preset, name), name).toEqual([]);
    }
  });

  it("keeps DELETE /media/:id and the folder delete as final deletes", () => {
    const preset = definePreset({ modules: modulesFor([]), features: [] });
    expect(stepsOf(preset, "deleteMedia")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.remove", "events.emit:media.deleted", "events.relay"]);
    expect(triggersOf(preset, "deleteMedia")).toEqual([{ http: "DELETE /media/:id", pipeline: "deleteMedia" }]);
    expect(triggersOf(preset, "deleteMediaFolder")).toEqual([{ http: "DELETE /media/folders/*path", pipeline: "deleteMediaFolder" }]);
  });

  it("hides and shows the image variants with the items, and removes them with a purge", () => {
    const preset = definePreset({ modules: modulesFor(["images"]), features: ["images"] });
    expect(stepsOf(preset, "trashMedia")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.trash", "images.hideMany", "events.emit:media.trashed", "events.relay"]);
    expect(stepsOf(preset, "trashMediaFolder")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", "media.trashFolder", "images.hideMany", "events.emit:media.trashed", "events.relay"]);
    expect(stepsOf(preset, "restoreMedia")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.write", "media.restore", "images.showMany", "events.emit:media.restored", "events.relay"]);
    expect(stepsOf(preset, "listMediaTrash")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.write", "media.listTrash"]);
    for (const [name, select] of [["purgeMedia", "media.selectTrash"], ["emptyMediaTrash", "media.selectAllTrash"]] as const) {
      expect(stepsOf(preset, name), name).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.delete", select, "media.purge", "images.removeMany", "events.emit:media.deleted", "events.relay"]);
    }
    expect(stepsOf(preset, "purgeExpiredMedia")).toEqual(["media.selectExpiredTrash", "media.purge", "images.removeMany", "events.emit:media.deleted", "events.relay"]);
  });

  it("leaves referenced items in the trash on every purge, and lets referenced items into the trash", () => {
    const preset = definePreset({ modules: modulesFor(["references", "images"]), features: ["references", "images"] });
    for (const [name, select] of [["purgeMedia", "media.selectTrash"], ["emptyMediaTrash", "media.selectAllTrash"]] as const) {
      expect(stepsOf(preset, name), name).toEqual([
        "authn.requireUser",
        "authz.requireRole",
        "authz.require:media.delete",
        select,
        "references.dropReferenced:media",
        "media.purge",
        "images.removeMany",
        "events.emit:media.deleted",
        "events.relay",
      ]);
    }
    expect(stepsOf(preset, "purgeExpiredMedia")).toEqual(["media.selectExpiredTrash", "references.dropReferenced:media", "media.purge", "images.removeMany", "events.emit:media.deleted", "events.relay"]);
    expect(stepsOf(preset, "trashMedia")).not.toContain("references.guard:media");
    expect(stepsOf(preset, "trashMediaFolder")).not.toContain("references.guardAll:media");
    expect(stepsOf(preset, "deleteMedia")).toContain("references.guard:media");
  });

  it("reschedules the expiry run, and explains a schedule while the trash is off", () => {
    const rescheduled = definePreset({ modules: modulesFor([]), features: [], schedules: { purgeExpiredMedia: "30 1 * * *" } });
    expect(triggersOf(rescheduled, "purgeExpiredMedia")).toEqual([{ cron: "30 1 * * *", pipeline: "purgeExpiredMedia" }]);

    expect(() => definePreset({ modules: modulesFor([], { use: MEDIA }), features: [], schedules: { purgeExpiredMedia: "30 1 * * *" } })).toThrow(
      'preset: schedule for pipeline "purgeExpiredMedia" – module "@michaelthielemann/kestrel-media-default" has no "trashRetentionDays", so there is no trash to empty – leave media.trashRetentionDays of presetModuleConfig() above 0',
    );
  });

  it("drops the expiry run with an excluded pipeline, and reports nothing for a full trash setup", () => {
    const excluded = definePreset({ modules: modulesFor([]), features: [], exclude: ["purgeExpiredMedia"] });
    expect(triggersOf(excluded, "purgeExpiredMedia")).toEqual([]);
    expect(checkPreset({ modules: modulesFor(["references", "images"]), features: ["references", "images"] }).problems).toEqual([]);
  });

  it("names every trash pipeline among the static pipeline names, so exclude and overrides accept them", () => {
    for (const name of TRASH_PIPELINES) expect((staticPipelineNames as readonly string[]).includes(name), name).toBe(true);
    const overridden = definePreset({ modules: modulesFor([]), features: [], overrides: { listMediaTrash: ["authn.requireUser", "authz.require:media.manage", "media.listTrash"] } });
    expect(stepsOf(overridden, "listMediaTrash")).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:media.manage", "media.listTrash"]);
  });
});
