import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  alias: { "#kestrel": app },
  components: [{ path: `${app}/components`, prefix: "Kestrel", pathPrefix: true }],
  routeRules: { "/admin/**": { ssr: false } },
  runtimeConfig: { public: { siteUrl: "" } },

  vite: {
    optimizeDeps: {
      include: ["@tiptap/vue-3", "@tiptap/starter-kit", "@tiptap/extension-highlight", "@tiptap/extension-subscript", "@tiptap/extension-superscript", "@tiptap/extension-text-align", "reka-ui", "dompurify", "@internationalized/date"],
    },
  },
});
