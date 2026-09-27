import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { fsCache: false, interopDefault: true });
const { createLayerPlugin } = await jiti.import(fileURLToPath(new URL("../layers/core/upgrade/plugin.ts", import.meta.url)));

export default function kestrelWebPlugin() {
  return createLayerPlugin();
}
