import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  modules: [fileURLToPath(new URL("./modules/optimize-deps/index.ts", import.meta.url)), fileURLToPath(new URL("./modules/insights-graph/index.ts", import.meta.url))],
  alias: { "#kestrel-admin": app },
  components: [{ path: `${app}/components`, prefix: "Kestrel", pathPrefix: true, priority: 10 }],
  routeRules: {
    "/admin/**": {
      ssr: false,
      headers: {
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "same-origin",
        "x-content-type-options": "nosniff",
        "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
    },
  },
  runtimeConfig: { public: { siteUrl: "" } },
});
