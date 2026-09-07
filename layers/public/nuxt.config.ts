import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineNuxtConfig({
  components: [{ path: `${app}/components`, prefix: "Kestrel", pathPrefix: true }],
  routeRules: { "/_preview/**": { ssr: false } },
});
