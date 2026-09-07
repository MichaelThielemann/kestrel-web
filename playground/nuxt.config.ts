export default defineNuxtConfig({
  compatibilityDate: "2026-08-28",
  extends: [".."],
  modules: ["@nuxt/eslint"],

  typescript: { tsConfig: { exclude: ["../../../kestrel/**", "../server/**", "../pipelines/**"] } },
});
