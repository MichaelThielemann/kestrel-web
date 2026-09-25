import { describe, expect, it } from "vitest";
import { parseTs, stringValue, arrayElements } from "@michaelthielemann/kestrel-upgrade/codemods";
import { layerLocateSteps, presetOverrideArrays } from "./locators";

const SHARED = `
const pipelineChanges: PresetPipelineChanges<typeof contentTypes> = {
  exclude: ["listNews"],
  overrides: { getMedia: ["authn.identifyUser", "authz.require:media.read", "media.get", "authz.fields:media?shape=item"] },
};
const modules = presetModuleConfig({ dataDir, pipelines: pipelineChanges });
export const preset = definePreset({ modules, features, ...pipelineChanges });
`;

describe("the layer's override locator", () => {
  it("finds an override inside the pipeline changes object a definePreset() call spreads", () => {
    const arrays = presetOverrideArrays(parseTs(SHARED), "getMedia");
    expect(arrays).toHaveLength(1);
    expect(arrayElements(arrays[0]!).map((el) => stringValue(el))).toContain("media.get");
    expect(layerLocateSteps(parseTs(SHARED), "getMedia")).toHaveLength(1);
  });

  it("follows the object through satisfies as well", () => {
    const source = SHARED.replace("const pipelineChanges: PresetPipelineChanges<typeof contentTypes> = {", "const pipelineChanges = {").replace("};\nconst modules", "} satisfies PresetPipelineChanges<typeof contentTypes>;\nconst modules");
    expect(presetOverrideArrays(parseTs(source), "getMedia")).toHaveLength(1);
  });

  it("still finds an override written inline", () => {
    const source = 'export const preset = definePreset({ modules, overrides: { getMedia: ["media.get"] } });';
    expect(presetOverrideArrays(parseTs(source), "getMedia")).toHaveLength(1);
  });

  it("finds nothing for a pipeline the changes do not override", () => {
    expect(presetOverrideArrays(parseTs(SHARED), "listMedia")).toEqual([]);
  });
});
