import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  modules: [fileURLToPath(new URL("./modules/optimize-deps/index.ts", import.meta.url)), fileURLToPath(new URL("./modules/insights-graph/index.ts", import.meta.url))],
  alias: { "#kestrel-admin": app },
  components: [{ path: `${app}/components`, prefix: "Kestrel", pathPrefix: true }],
  routeRules: { "/admin/**": { ssr: false } },
  runtimeConfig: { public: { siteUrl: "" } },
});
