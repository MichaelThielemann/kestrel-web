export default defineNuxtConfig({
  compatibilityDate: "2026-08-28",
  extends: ["@michaelthielemann/kestrel-web"],
  routeRules: { "/about/**": { isr: 60 } },
});
