import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { describe, expect, it } from "vitest";
import { checkPreset, definePreset, delaysFor } from "./index";
import type { PresetOptions } from "./index";

function options(raw: unknown): PresetOptions {
  return boundaryCast<PresetOptions>(raw, "json");
}

const baseModules = [
  { use: "@michaelthielemann/kestrel-authn-multi" },
  { use: "@michaelthielemann/kestrel-authz-roles" },
  { use: "@michaelthielemann/kestrel-content-default" },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: { "pages.body": "x" } } },
  { use: "@michaelthielemann/kestrel-media-default" },
  { use: "@michaelthielemann/kestrel-events-inmemory" },
  { use: "@michaelthielemann/kestrel-events-direct" },
];

const eventsBus = "@michaelthielemann/kestrel-events-inmemory";

describe("checkPreset parity with definePreset", () => {
  it("collects the same message definePreset throws, for an invalid collection name", () => {
    const testOptions: PresetOptions = { modules: baseModules, features: [], collections: { "Bad-Name": { kind: "single", fields: {} } } };
    expect(() => definePreset(testOptions)).toThrow();
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/collection-name-invalid");
    expect(problems[0]?.message).toBe(thrown);
  });

  it("collects the same message definePreset throws, for a reserved collection name", () => {
    const testOptions: PresetOptions = { modules: baseModules, features: [], collections: { media: { kind: "single", fields: {} } } };
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/collection-name-reserved");
    expect(problems[0]?.message).toBe(thrown);
  });

  it("collects the same message definePreset throws, for a missing event bus", () => {
    const modules = baseModules.filter((m) => m.use !== eventsBus);
    const testOptions: PresetOptions = { modules, features: [] };
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { problems } = checkPreset(testOptions);
    expect(problems.map((p) => p.code)).toContain("preset/missing-event-bus");
    expect(problems.find((p) => p.code === "preset/missing-event-bus")?.message).toBe(thrown);
  });

  it("collects the same message definePreset throws, for an override naming an unknown pipeline", () => {
    const testOptions = options({ modules: baseModules, features: [], overrides: { doesNotExist: ["authn.requireUser"] } });
    let thrown: string | undefined;
    try {
      definePreset(testOptions);
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }
    const { preset, problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/override-unknown-pipeline");
    expect(problems[0]?.message).toBe(thrown);
    expect(preset.pipelines.some((p) => p.name === "doesNotExist")).toBe(false);
  });

  it("never throws, unlike definePreset, and still composes a preset", () => {
    const testOptions = options({ modules: baseModules, features: [], exclude: ["doesNotExist"] });
    expect(() => checkPreset(testOptions)).not.toThrow();
    const { preset, problems } = checkPreset(testOptions);
    expect(problems[0]?.code).toBe("preset/exclude-unknown-pipeline");
    expect(preset.pipelines.length).toBeGreaterThan(0);
  });

  it("applies a valid override exactly as given even when a different, unrelated problem exists", () => {
    const testOptions = options({
      modules: baseModules.filter((m) => m.use !== eventsBus),
      features: [],
      overrides: { me: ["authn.requireUser", "authn.loadIdentity", "events.emit:me.viewed"] },
    });
    const { preset, problems } = checkPreset(testOptions);
    expect(problems.some((p) => p.code === "preset/missing-event-bus")).toBe(true);
    expect(preset.pipelines.find((p) => p.name === "me")?.steps).toEqual(["authn.requireUser", "authn.loadIdentity", "events.emit:me.viewed"]);
  });

  it("collects every independent problem in one call instead of stopping at the first", () => {
    const testOptions = options({
      modules: baseModules.filter((m) => m.use !== eventsBus),
      features: [],
      collections: { "Bad-Name": { kind: "single", fields: {} } },
      overrides: { login: ["authn.login"], doesNotExist: ["authn.requireUser"] },
      exclude: ["login", "alsoMissing"],
    });
    const { problems } = checkPreset(testOptions);
    const codes = problems.map((p) => p.code);
    expect(codes).toContain("preset/collection-name-invalid");
    expect(codes).toContain("preset/missing-event-bus");
    expect(codes).toContain("preset/override-unknown-pipeline");
    expect(codes).toContain("preset/exclude-unknown-pipeline");
    expect(codes).toContain("preset/override-and-exclude");
    expect(problems.length).toBeGreaterThanOrEqual(5);
  });

  it("drops the atomic group around a content write and is still reported, with the override applied as given", () => {
    const testOptions = options({
      modules: baseModules,
      features: [],
      overrides: { deletePage: ["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", "content.remove:pages"] },
    });
    const { preset, problems } = checkPreset(testOptions);
    expect(problems.some((p) => p.code === "preset/override-drops-atomic-group" && p.pipeline === "deletePage")).toBe(true);
    expect(preset.pipelines.find((p) => p.name === "deletePage")?.steps).toEqual(["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", "content.remove:pages"]);
  });
});

describe("checkPreset: dependent re-rendering and queue lanes", () => {
  const queue = "@michaelthielemann/kestrel-events-queue";
  const deliveryStatic = "@michaelthielemann/kestrel-delivery-static";
  const collections = {
    pages: { kind: "multi", fields: { slug: { type: "slug" }, title: {}, body: {}, status: {} } },
    profile: { kind: "single", fields: { bio: {} } },
  };

  function modules(features: readonly string[], { render, lanes, delayMs }: { render?: string; lanes?: unknown; delayMs?: unknown } = {}): { use: string; config?: unknown }[] {
    const queued = features.includes("eventsQueue");
    const list: { use: string; config?: unknown }[] = baseModules.filter((m) => !(queued && m.use === "@michaelthielemann/kestrel-events-direct"));
    const queueConfig = { ...(lanes === undefined ? {} : { lanes }), ...(delayMs === undefined ? {} : { delayMs }) };
    if (queued) list.push(Object.keys(queueConfig).length === 0 ? { use: queue } : { use: queue, config: queueConfig });
    if (features.includes("delivery")) {
      list.push({ use: "@michaelthielemann/kestrel-renderer-nuxt" });
      list.push({ use: deliveryStatic, config: render === undefined ? {} : { dependencies: { render } } });
    }
    if (features.includes("images")) list.push({ use: "@michaelthielemann/kestrel-images-default" });
    return list;
  }

  function thrownBy(testOptions: PresetOptions): string | undefined {
    try {
      definePreset(testOptions);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    return undefined;
  }

  function expectParity(testOptions: PresetOptions, code: string, pipeline?: string): void {
    const thrown = thrownBy(testOptions);
    expect(thrown, code).toBeDefined();
    const { problems } = checkPreset(testOptions);
    const problem = problems.find((p) => p.code === code);
    expect(problem?.message).toBe(thrown);
    if (pipeline !== undefined) expect(problem?.pipeline).toBe(pipeline);
  }

  it("collects a queue with delivery whose delivery-static renders in the background", () => {
    const features = ["eventsQueue", "delivery"];
    expectParity(options({ modules: modules(features, { render: "background", lanes: { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] } }), features, collections }), "preset/render-mode-needs-events");
  });

  it("collects render mode \"events\" without the queue", () => {
    expectParity(options({ modules: modules(["delivery"], { render: "events" }), features: ["delivery"], collections }), "preset/render-mode-needs-queue");
  });

  it("collects a queue entry without lanes, and lanes that split the page renders from the llms.txt export", () => {
    const features = ["eventsQueue", "delivery"];
    expectParity(options({ modules: modules(features, { render: "events" }), features, collections }), "preset/page-renders-lane");
    expectParity(options({ modules: modules(features, { render: "events", lanes: { pages: ["republishOutput"], llms: ["refreshLlms"] } }), features, collections }), "preset/page-renders-lane");
  });

  it("collects a queue whose lanes leave the index export in the main lane or share its lane, naming it", () => {
    const features = ["eventsQueue", "delivery"];
    expectParity(options({ modules: modules(features, { render: "events", lanes: { pages: ["republishOutput", "refreshLlms"] } }), features, collections }), "preset/index-exports-lane", "refreshIndexes");
    expectParity(options({ modules: modules(features, { render: "events", lanes: { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes", "purgeEvents"] } }), features, collections }), "preset/index-exports-lane", "refreshIndexes");
  });

  it("collects a delayMs entry naming a preset pipeline this configuration does not compose, naming it", () => {
    const features = ["eventsQueue"];
    expectParity(options({ modules: modules(features, { delayMs: { refreshLlms: 3000 } }), features, collections }), "preset/delay-pipeline-unknown", "refreshLlms");
  });

  it("collects a delayMs that leaves out or changes the delay of an index export the preset composes, naming it", () => {
    const features = ["eventsQueue", "delivery"];
    const lanes = { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] };
    expectParity(options({ modules: modules(features, { render: "events", lanes, delayMs: {} }), features, collections }), "preset/index-export-delays", "refreshIndexes");
    expectParity(options({ modules: modules(features, { render: "events", lanes, delayMs: { refreshIndexes: 60_000, refreshLlms: 3000 } }), features, collections }), "preset/index-export-delays", "refreshIndexes");
    expectParity(options({ modules: modules(features, { render: "events", lanes, delayMs: { refreshIndexes: 1000, refreshLlms: 0 } }), features, collections }), "preset/index-export-delays", "refreshLlms");
    expect(thrownBy(options({ modules: modules(features, { render: "events", lanes, delayMs: { refreshIndexes: 60_000 } }), features, collections }))).toBe(
      'preset: module "@michaelthielemann/kestrel-events-queue" holds back pipeline "refreshIndexes" for 60000 ms and leaves out pipeline "refreshLlms" in delayMs, but the preset fixes "refreshIndexes" at 1000 ms and "refreshLlms" at 3000 ms – spread delaysFor(features) into delayMs and add your own pipelines after it: { ...delaysFor(features), myPipeline: 5000 }',
    );
    expect(checkPreset(options({ modules: modules(features, { render: "events", lanes, delayMs: { refreshIndexes: 1000, refreshLlms: 3000 } }), features, collections })).problems).toEqual([]);
  });

  it("names every index export a delayMs of the site's own pipelines leaves out, and accepts those pipelines next to delaysFor(features)", () => {
    const features = ["eventsQueue", "delivery"];
    const lanes = { pages: ["republishOutput", "refreshLlms"], indexes: ["refreshIndexes"] };
    expect(thrownBy(options({ modules: modules(features, { render: "events", lanes, delayMs: { digest: 60_000 } }), features, collections }))).toBe(
      'preset: module "@michaelthielemann/kestrel-events-queue" leaves out pipelines "refreshIndexes" and "refreshLlms" in delayMs, but the preset fixes "refreshIndexes" at 1000 ms and "refreshLlms" at 3000 ms – spread delaysFor(features) into delayMs and add your own pipelines after it: { ...delaysFor(features), myPipeline: 5000 }',
    );
    expect(checkPreset(options({ modules: modules(features, { render: "events", lanes, delayMs: { ...delaysFor(["eventsQueue", "delivery"]), digest: 60_000 } }), features, collections })).problems).toEqual([]);
  });

  it("collects a background delivery-static whose indexesDelayMs differs from the preset's", () => {
    const features = ["delivery"];
    const list = modules(features).map((entry) => (entry.use === deliveryStatic ? { use: deliveryStatic, config: { dependencies: { render: "background", indexesDelayMs: 0 } } } : entry));
    expectParity(options({ modules: list, features, collections }), "preset/index-export-delays");
    expect(thrownBy(options({ modules: list, features, collections }))).toBe(
      'preset: module "@michaelthielemann/kestrel-delivery-static" holds back the index export for 0 ms in dependencies.indexesDelayMs, but the preset fixes that delay at 1000 ms – leave indexesDelayMs out, or set it to 1000',
    );
    const fixed = modules(features).map((entry) => (entry.use === deliveryStatic ? { use: deliveryStatic, config: { dependencies: { render: "background", indexesDelayMs: 1000 } } } : entry));
    expect(checkPreset(options({ modules: fixed, features, collections })).problems).toEqual([]);
  });

  it("collects a lane naming a preset pipeline this configuration does not compose, naming it", () => {
    const features = ["eventsQueue"];
    expectParity(options({ modules: modules(features, { lanes: { pages: ["republishOutput"] } }), features, collections }), "preset/lane-pipeline-unknown", "republishOutput");
  });

  it("collects an override that drops an emit a dependents pipeline listens to, naming the pipeline, and still applies it", () => {
    const override = ["authn.requireUser", "authz.requireRole", "authz.require:profile.write", { atomic: ["content.set:profile"] }, "events.relay"];
    const testOptions = options({ modules: modules(["delivery"]), features: ["delivery"], collections, overrides: { setProfile: override } });
    expectParity(testOptions, "preset/override-drops-watched-emit", "setProfile");
    expect(checkPreset(testOptions).preset.pipelines.find((p) => p.name === "setProfile")?.steps).toEqual(override);
  });

  it("collects an override that places events.relay before the entry carrying the pipeline's own events.emit: step", () => {
    const override = ["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", "events.relay", { atomic: ["content.remove:pages", "events.emit:page.deleted"] }];
    const testOptions = options({ modules: modules([]), features: [], collections, overrides: { deletePage: override } });
    expectParity(testOptions, "preset/override-relay-before-emit", "deletePage");
    expect(checkPreset(testOptions).preset.pipelines.find((p) => p.name === "deletePage")?.steps).toEqual(override);
  });

  it("accepts an eventsQueue override that keeps events.emit outside the group but relay correctly after it: the upgrade tool's own rule offers moving it in, checkPreset does not block it", () => {
    const features = ["eventsQueue"];
    const override = ["authn.requireUser", "authz.requireRole", "authz.require:pages.manage", { atomic: ["content.remove:pages"] }, "events.emit:page.deleted", "events.relay"];
    const testOptions = options({ modules: modules(features), features, collections, overrides: { deletePage: override } });
    expect(checkPreset(testOptions).problems).toEqual([]);
  });

  it("collects a queue entry without lanes when images renders variants, since they would run in the main lane", () => {
    const features = ["eventsQueue", "images"];
    expectParity(options({ modules: modules(features), features }), "preset/generate-image-variants-lane", "generateImageVariants");
    expect(checkPreset(options({ modules: modules(features, { lanes: { variants: ["generateImageVariants"] } }), features })).problems).toEqual([]);
  });

  it("collects every one of these problems in one call", () => {
    const features = ["eventsQueue", "delivery", "images"];
    const { problems } = checkPreset(options({
      modules: modules(features, { render: "background" }),
      features,
      collections,
      overrides: { setProfile: ["authn.requireUser", { atomic: ["content.set:profile"] }, "events.relay"] },
    }));
    expect(problems.map((p) => p.code).sort()).toEqual([
      "preset/generate-image-variants-lane",
      "preset/index-exports-lane",
      "preset/override-drops-watched-emit",
      "preset/page-renders-lane",
      "preset/render-mode-needs-events",
    ]);
  });
});

describe("private blob prefixes", () => {
  const replication = (config: Record<string, unknown>) => ({ use: "@michaelthielemann/kestrel-replication-sqlite", config: { file: "data/kestrel.db", ...config } });

  function problemCodes(modules: readonly { use: string; config?: unknown }[]): string[] {
    return checkPreset({ modules: [...baseModules, ...modules], features: [] }).problems.map((problem) => problem.code);
  }

  it("accepts the replica under its own default prefix next to the public site/ tree", () => {
    expect(problemCodes([replication({})])).not.toContain("preset/private-prefix-public");
    expect(problemCodes([replication({ prefix: "private/replica/" })])).not.toContain("preset/private-prefix-public");
  });

  it("refuses a replica prefix under the public site/ tree, naming both prefixes", () => {
    const testOptions: PresetOptions = { modules: [...baseModules, replication({ prefix: "site/replica/" })], features: [] };
    expect(() => definePreset(testOptions)).toThrow(/replication-sqlite.*"site\/replica\/".*public.*"site\/"/);
    expect(problemCodes([replication({ prefix: "site/replica/" })])).toContain("preset/private-prefix-public");
  });

  it("refuses a replica prefix that contains the public tree, such as the whole store", () => {
    expect(problemCodes([replication({ prefix: "" })])).toContain("preset/private-prefix-public");
  });

  it("refuses a replica under a public prefix configured on delivery-static or media-default", () => {
    expect(problemCodes([{ use: "@michaelthielemann/kestrel-delivery-static", config: { prefix: "www/" } }, replication({ prefix: "www/replica/" })])).toContain("preset/private-prefix-public");
    const mediaModules = baseModules.map((entry) => (entry.use === "@michaelthielemann/kestrel-media-default" ? { use: entry.use, config: { publicCopy: { prefix: "pub/" } } } : entry));
    const { problems } = checkPreset({ modules: [...mediaModules, replication({ prefix: "pub/db/" })], features: [] });
    expect(problems.map((problem) => problem.code)).toContain("preset/private-prefix-public");
  });

  it("refuses a database backup key under the public tree", () => {
    expect(problemCodes([{ use: "@michaelthielemann/kestrel-backup-blobstore", config: { file: "data/kestrel.db", key: "site/backup/kestrel.db" } }])).toContain("preset/private-prefix-public");
    expect(problemCodes([{ use: "@michaelthielemann/kestrel-backup-blobstore", config: { file: "data/kestrel.db", key: "backup/kestrel.db" } }])).not.toContain("preset/private-prefix-public");
  });
});
