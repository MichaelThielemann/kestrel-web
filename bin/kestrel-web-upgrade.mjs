#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { runUpgradeCli } from "@michaelthielemann/kestrel-upgrade/plugin";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const pluginModule = fileURLToPath(new URL("../layers/core/upgrade/plugin.ts", import.meta.url));
const { createLayerPlugin } = await jiti.import(pluginModule);

const plugin = createLayerPlugin();

runUpgradeCli(process.argv.slice(2), { plugins: [plugin] })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  });
