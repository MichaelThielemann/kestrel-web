const publicDir = process.env.KESTREL_E2E_PUBLIC_DIR;

export default defineNuxtConfig({
  compatibilityDate: "2026-08-28",
  ...(publicDir === undefined || publicDir === "" ? {} : { dir: { public: publicDir } }),
  extends: [".."],
  modules: ["@nuxt/eslint"],

  typescript: { tsConfig: { exclude: ["../../../kestrel/**", "../server/**", "../pipelines/**", "../../packages/create-kestrel/template/**"] } },
});
