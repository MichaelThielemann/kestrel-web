import { describe, expect, it } from "vitest";
import type { LoadedProject } from "@michaelthielemann/kestrel-upgrade/plugin";
import { layerMediaWiring } from "./mediaWiring";

const PROJECT: LoadedProject = {
  input: { config: { modules: [], triggers: [], http: null }, modules: [], pipelines: [] },
  kind: "kestrel-web",
  configFile: "/fake/kestrel.config.ts",
  moduleFiles: new Map(),
  pipelineFiles: [],
};

describe("layerMediaWiring", () => {
  it("always returns the layer's fixed media wiring, regardless of the project", () => {
    expect(layerMediaWiring(PROJECT)).toEqual({ publicPath: "/media", copyPrefix: "site/", reservedPaths: ["/api", "/admin", "/media"] });
  });
});
