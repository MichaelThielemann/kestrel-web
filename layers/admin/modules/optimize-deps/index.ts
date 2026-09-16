import { defineNuxtModule } from "@nuxt/kit";
import { packageInstalled } from "#kestrel-core/modules/optional-modules/installed";

const PREBUNDLED = ["@tiptap/vue-3", "@tiptap/starter-kit", "@tiptap/extension-highlight", "@tiptap/extension-subscript", "@tiptap/extension-superscript", "@tiptap/extension-text-align", "reka-ui", "dompurify", "@internationalized/date"];

type ViteConfig = { optimizeDeps?: { include?: string[] } };

export default defineNuxtModule({
  meta: { name: "kestrel-admin-optimize-deps" },
  setup(_options, nuxt) {
    const resolvable = PREBUNDLED.filter((name) => packageInstalled(name, [nuxt.options.rootDir]));
    if (resolvable.length === 0) return;
    nuxt.hook("vite:extendConfig", (config) => {
      const vite = config as ViteConfig;
      vite.optimizeDeps ??= {};
      vite.optimizeDeps.include = [...(vite.optimizeDeps.include ?? []), ...resolvable];
    });
  },
});
