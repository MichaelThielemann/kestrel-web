import { defineConfig } from "@michaelthielemann/kestrel/defineConfig";
import { definePreset, presetSchemas } from "#kestrel/pipelines";
import { contentTypes, features } from "./shared/model";

const modules = [
  { use: "@michaelthielemann/kestrel-content-default", config: { types: contentTypes } },
  { use: "@michaelthielemann/kestrel-validate-jsonschema", config: { schemas: presetSchemas({ features, collections: contentTypes }), maxDepth: 32, maxNodes: 20000 } },
];

export const preset = definePreset({ modules, features, collections: contentTypes });

export default defineConfig({ modules, triggers: preset.triggers, http: null });
