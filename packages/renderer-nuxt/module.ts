import { z } from "zod";
import { RENDERER, type Renderer } from "@michaelthielemann/kestrel-contracts/renderer";
import { defineModule } from "@michaelthielemann/kestrel/defineModule";
import { createRendererNuxt } from "./impl.ts";

export const configSchema = z
  .object({
    assets: z.boolean().default(true),
  })
  .strict();

export default defineModule({
  name: "renderer/nuxt",
  provides: [RENDERER],
  requires: [],
  configSchema,

  async setup(config): Promise<Renderer> {
    return createRendererNuxt(config);
  },
});
