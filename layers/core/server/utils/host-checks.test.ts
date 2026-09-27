import { describe, expect, it } from "vitest";
import type { BootProblem, Manifest } from "@michaelthielemann/kestrel";
import { layerBootInput } from "./boot-input";
import { layerHostProblems, type LayerHostCheckInput } from "./host-checks";

const VALIDATE = "@michaelthielemann/kestrel-validate-jsonschema";

const bootstrapTriggers = [
  { method: "POST", path: "/login", pipeline: "login" },
  { method: "POST", path: "/logout", pipeline: "logout" },
  { method: "GET", path: "/me", pipeline: "me" },
];

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    core: { version: "0.0.0" },
    contracts: [],
    modules: [],
    steps: [],
    pipelines: [],
    triggers: { http: bootstrapTriggers, events: [], crons: [] },
    warnings: [],
    ...overrides,
  };
}

function input(overrides: Partial<LayerHostCheckInput> = {}): LayerHostCheckInput {
  return { configModules: [], modules: [], pipelines: [], collectionsUi: {}, presetProblems: [], bootErrors: [], complete: false, ...overrides };
}

describe("layerHostProblems", () => {
  it("reports nothing for a project whose boot routes, model and preset agree", () => {
    expect(layerHostProblems(input({ manifest: manifest() }))).toEqual([]);
  });

  it("reports every preset problem as an error with its code and pipeline", () => {
    const problems = layerHostProblems(input({ presetProblems: [{ code: "preset/unknown-override", pipeline: "updateThing", message: "overrides names updateThing, which the preset does not define" }] }));
    expect(problems).toEqual([{ code: "preset/unknown-override", severity: "error", owner: "kestrel-web", pipeline: "updateThing", reason: "overrides names updateThing, which the preset does not define" }]);
  });

  it("reports a site-default config that disagrees with shared/model", () => {
    const configModules = [{ use: "@michaelthielemann/kestrel-site-default", config: { prefixPrimary: false, routes: { pages: { home: "start" } } } }];
    const problems = layerHostProblems(input({ configModules, siteModel: { prefixPrimary: true, homeSlug: "start" } }));
    expect(problems.map((p) => p.code)).toEqual(["site-model"]);
    expect(problems[0]?.reason).toContain("prefixPrimary");
  });

  it("reports an admin bootstrap pipeline bound to another route", () => {
    const http = [bootstrapTriggers[0]!, bootstrapTriggers[1]!, { method: "GET", path: "/whoami", pipeline: "me" }];
    const problems = layerHostProblems(input({ manifest: manifest({ triggers: { http, events: [], crons: [] } }) }));
    expect(problems.map((p) => p.code)).toEqual(["admin-bootstrap"]);
    expect(problems[0]?.reason).toContain('"GET /whoami"');
  });

  it("checks the media routes only when every module and pipeline was checked", () => {
    expect(layerHostProblems(input({ manifest: manifest() }))).toEqual([]);
    const problems = layerHostProblems(input({ manifest: manifest(), complete: true }));
    expect(problems.map((p) => p.code)).toEqual(["media-paths"]);
  });

  it("turns a module list that does not match the config entries into a status-filter error instead of throwing", () => {
    const content = { name: "content/default" };
    const problems = layerHostProblems(input({ modules: [content], configModules: [], manifest: manifest({ steps: [{ name: "content.list", module: "content/default", factory: false, description: {} }] }) }));
    expect(problems.map((p) => p.code)).toEqual(["status-filter"]);
    expect(problems[0]?.reason).toContain("the module list and the config entries must be in the same order");
  });

  it("reports a field the collection UI shows as a link that the write pipelines do not check", () => {
    const content = { name: "content/default" };
    const configModules = [{ use: "@michaelthielemann/kestrel-content-default", config: { types: { news: { kind: "multi", fields: { cta: { type: "json" } } } } } }];
    const pipelines = [{ name: "createNews", steps: ["authn.requireUser", "content.create:news"] }];
    const collectionsUi = { news: { fieldOverrides: { cta: { type: "link" } } } };
    const problems = layerHostProblems(input({ modules: [content], configModules, pipelines, collectionsUi, manifest: manifest({ steps: [{ name: "content.list", module: "content/default", factory: false, description: {} }] }) }));
    expect(problems.map((p) => p.code)).toEqual(["link-check"]);
    expect(problems[0]?.reason).toContain("validate.check:news.cta");
  });

  it("adds the field grant fix as a warning for an uncut grant authz/roles refuses", () => {
    const bootErrors: BootProblem[] = [
      { code: "config-invalid", owner: "authz/roles", reason: 'anonymousFields grants fields of "news", but no pipeline ends with authz.fields:news' },
      { code: "config-invalid", owner: "content/default", reason: 'anonymousFields grants fields of "news", but no pipeline ends with authz.fields:news' },
    ];
    const problems = layerHostProblems(input({ bootErrors }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: "field-grant-hint", severity: "warning", module: "authz/roles" });
    expect(problems[0]?.reason).toContain('"news": pass the same exclude and overrides');
  });
});

describe("layerBootInput", () => {
  it("replaces a validate-jsonschema schema the build bundled and leaves the rest of the input alone", () => {
    const config = { modules: [{ use: VALIDATE, config: { schemas: { page: "./schemas/page.json" } } }, { use: "@michaelthielemann/kestrel-content-default" }] };
    const bundled = { type: "object" };
    const result = layerBootInput({ config, modules: [], pipelines: [], bundledSchemas: { mode: "bundled", schemas: { page: bundled } } });
    expect(result.config.modules[0]?.config).toEqual({ schemas: { page: bundled } });
    expect(result.config.modules[1]).toEqual({ use: "@michaelthielemann/kestrel-content-default" });
    expect(config.modules[0]?.config).toEqual({ schemas: { page: "./schemas/page.json" } });
  });
});
