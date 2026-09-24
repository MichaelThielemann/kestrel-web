import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import type { Linter } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const configPath = fileURLToPath(new URL("../playground/eslint.config.mjs", import.meta.url));

async function loadConfig(): Promise<{ name?: string }[]> {
  const composer = (await import(configPath)) as { default: unknown };
  return (await composer.default) as { name?: string }[];
}

async function lintVirtual(code: string, filePath: string): Promise<Linter.LintMessage[]> {
  const fullConfig = await loadConfig();
  const config = fullConfig.filter((entry) => entry.name !== "kestrel/type-aware" && entry.name !== "kestrel/type-aware-server");
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: true, overrideConfig: config as Linter.Config[] });
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

async function lintFixtureFile(relativePath: string): Promise<Linter.LintMessage[]> {
  const fullConfig = await loadConfig();
  const config = fullConfig.filter((entry) => entry.name !== "kestrel/lint-fixtures-ignore");
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: true, overrideConfig: config as Linter.Config[] });
  const [result] = await eslint.lintFiles([relativePath]);
  return result?.messages ?? [];
}

function expectMessage(messages: Linter.LintMessage[], ruleId: string, messageIncludes: string): void {
  const found = messages.some((m) => m.ruleId === ruleId && m.message.includes(messageIncludes));
  expect(found, `expected ${ruleId} with a message including "${messageIncludes}", got: ${JSON.stringify(messages.map((m) => ({ ruleId: m.ruleId, message: m.message })))}`).toBe(true);
}

describe("project-specific eslint rules have a violating fixture", () => {
  it("kestrel/layer-boundaries: bans `as unknown as T`", async () => {
    const messages = await lintVirtual("const x = 1 as unknown as string;\n", "layers/admin/app/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "as unknown as T` is banned");
  });

  it("kestrel/layer-boundaries: bans `as any`", async () => {
    const messages = await lintVirtual("const x = 1 as any;\n", "layers/admin/app/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "as any` is banned");
  });

  it("kestrel/layer-boundaries: bans a relative import crossing a layer", async () => {
    const messages = await lintVirtual('import { x } from "../../core/app/utils/foo";\n', "layers/admin/app/actions/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "Relative imports must not cross a layer");
  });

  it("kestrel/layer-boundaries: bans a `~~/layers/...` import crossing a layer", async () => {
    const messages = await lintVirtual('import { x } from "~~/layers/admin/app/foo";\n', "layers/public/app/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "Absolute `~~/layers/...` imports must not cross a layer");
  });

  it("kestrel/no-admin-from-public-or-core: bans `#kestrel-admin/*` outside layers/admin (proves the `#` escaping in the glob pattern)", async () => {
    const messages = await lintVirtual('import { x } from "#kestrel-admin/actions/foo";\n', "layers/public/app/probe.ts");
    expectMessage(messages, "no-restricted-imports", "Only layers/admin may import #kestrel-admin/*.");
  });

  it("kestrel/no-backend-in-ui-layers: bans a Kestrel backend import in a UI layer", async () => {
    const messages = await lintVirtual('import { x } from "@michaelthielemann/kestrel";\n', "layers/public/app/probe.ts");
    expectMessage(messages, "@typescript-eslint/no-restricted-imports", "UI code does not import Kestrel backend packages");
  });

  it("kestrel/backend-types-only-in-core-app-types: bans a value import of a Kestrel backend package", async () => {
    const messages = await lintVirtual('import { x } from "@michaelthielemann/kestrel";\n', "layers/core/app/types/probe.ts");
    expectMessage(messages, "@typescript-eslint/no-restricted-imports", "layers/core/app/types may import Kestrel backend packages as types only.");
  });

  it("kestrel/backend-types-only-in-core-app-types: bans a type-only import from a backend package's impl subpath", async () => {
    const messages = await lintVirtual('import type { X } from "@michaelthielemann/kestrel-media-default/impl";\n', "layers/core/app/types/probe.ts");
    expectMessage(messages, "@typescript-eslint/no-restricted-imports", "layers/core/app/types takes its types from the generated OpenAPI document");
  });

  it("kestrel/backend-types-only-in-core-app-types: bans a value import of a two-segment impl subpath", async () => {
    const messages = await lintVirtual('import { x } from "@michaelthielemann/kestrel-media-default/dist/impl";\n', "layers/core/app/types/probe.ts");
    expectMessage(messages, "@typescript-eslint/no-restricted-imports", "layers/core/app/types takes its types from the generated OpenAPI document");
  });

  it("kestrel/backend-types-only-in-core-app-types: bans a type-only import of impl nested under a further subpath", async () => {
    const messages = await lintVirtual('import type { X } from "@michaelthielemann/kestrel-media-default/impl/media";\n', "layers/core/app/types/probe.ts");
    expectMessage(messages, "@typescript-eslint/no-restricted-imports", "layers/core/app/types takes its types from the generated OpenAPI document");
  });

  it("kestrel/backend-types-only-in-core-app-types: bans a value import of a two-segment non-impl subpath but allows it as a type", async () => {
    const valueMessages = await lintVirtual('import { x } from "@michaelthielemann/kestrel-contracts/src/persistence";\n', "layers/core/app/types/probe.ts");
    expectMessage(valueMessages, "@typescript-eslint/no-restricted-imports", "layers/core/app/types may import Kestrel backend packages as types only.");

    const typeMessages = await lintVirtual('import type { X } from "@michaelthielemann/kestrel-contracts/src/persistence";\n', "layers/core/app/types/probe.ts");
    expect(typeMessages.some((m) => m.ruleId === "@typescript-eslint/no-restricted-imports")).toBe(false);
  });

  it("kestrel/ui-kit-first and its companion rules: ban raw controls, restricted attributes/classes and disguised role/is bindings", async () => {
    const code = `<template>
  <div>
    <div v-html="raw"></div>
    <table></table>
    <button></button>
    <input>
    <select></select>
    <textarea></textarea>
    <dialog></dialog>
    <div role="button"></div>
    <a href="#">go</a>
    <component is="table" />
    <div class="ui-button--primary"></div>
    <Table></Table>
    <component :is="'table'" />
    <div :role="'button'"></div>
  </div>
</template>
<script setup lang="ts">
const raw = "<b>x</b>"
</script>
`;
    const messages = await lintVirtual(code, "layers/admin/app/components/Probe.vue");
    expectMessage(messages, "vue/no-v-html", "");
    expectMessage(messages, "vue/no-restricted-html-elements", "Use KestrelUiTable");
    expectMessage(messages, "vue/no-restricted-html-elements", "Use KestrelUiButton");
    expectMessage(messages, "vue/no-restricted-html-elements", "Use KestrelUiTextInput");
    expectMessage(messages, "vue/no-restricted-html-elements", "Use KestrelUiSelect");
    expectMessage(messages, "vue/no-restricted-html-elements", "Use KestrelUiTextarea");
    expectMessage(messages, "vue/no-restricted-html-elements", "Use KestrelUiDialog");
    expectMessage(messages, "vue/no-restricted-static-attribute", 'Use KestrelUiButton instead of role="button"');
    expectMessage(messages, "vue/no-restricted-static-attribute", "A link that goes nowhere is a button");
    expectMessage(messages, "vue/no-restricted-static-attribute", "Use the KestrelUi* component");
    expectMessage(messages, "vue/no-restricted-class", "");
    expectMessage(messages, "vue/no-restricted-syntax", "Raw control in mixed case");
    expectMessage(messages, "vue/no-restricted-syntax", "Use the KestrelUi* component");
    expectMessage(messages, "vue/no-restricted-syntax", 'Use KestrelUiButton instead of :role="\'button\'"');
  });

  it("kestrel/type-aware fires on layers/*/app/**", async () => {
    const messages = await lintFixtureFile("layers/public/app/__lint_fixtures__/type-aware.ts");
    expectMessage(messages, "@typescript-eslint/no-floating-promises", "");
  });

  it("kestrel/type-aware-server fires on layers/*/pipelines/**", async () => {
    const messages = await lintFixtureFile("layers/core/pipelines/__lint_fixtures__/type-aware-server.ts");
    expectMessage(messages, "@typescript-eslint/no-floating-promises", "");
  });

  it("kestrel/type-aware covers packages/create-kestrel/**", async () => {
    const messages = await lintFixtureFile("packages/create-kestrel/__lint_fixtures__/type-aware.ts");
    expectMessage(messages, "@typescript-eslint/no-floating-promises", "");
  });

  it("kestrel/type-aware covers .ts files directly in layers/core/", async () => {
    const messages = await lintFixtureFile("layers/core/lint-fixture-type-aware.ts");
    expectMessage(messages, "@typescript-eslint/no-floating-promises", "");
  });

  it("kestrel/admin-api-routes: bans a path literal passed to the admin API client", async () => {
    const messages = await lintVirtual("const api = useAdminApi();\nawait api('/users');\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "not a path literal");
  });

  it("kestrel/admin-api-routes: bans a hand-built route object", async () => {
    const messages = await lintVirtual("export const call = { path: `/users/${'x'}`, method: 'DELETE' };\n", "layers/admin/app/actions/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "not from an object literal");
  });

  it("kestrel/admin-api-routes: bans a raw /api URL", async () => {
    const messages = await lintVirtual("export const src = (id: string) => `/api/media/${id}/file`;\n", "layers/admin/app/components/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "apiUrl()");
  });

  it("kestrel/admin-api-routes: bans useApi() outside useAdminApi", async () => {
    const messages = await lintVirtual("const api = useApi();\n", "layers/admin/app/components/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "useAdminApi()");
  });

  it("kestrel/admin-api-routes: bans useApi() and a path literal inside a .vue <script setup> block", async () => {
    const code = `
<script setup lang="ts">
const api = useApi()
const status = await api('/admin/events/delivery')
</script>
`;
    const messages = await lintVirtual(code, "layers/admin/app/components/Probe.vue");
    expectMessage(messages, "no-restricted-syntax", "useAdminApi()");
    expectMessage(messages, "no-restricted-syntax", "not a path literal");
  });

  it("kestrel/admin-api-routes: leaves admin page routes alone", async () => {
    const messages = await lintVirtual("await navigateTo('/admin/login');\nawait navigateTo({ path: '/admin/system', query: {} });\n", "layers/admin/app/pages/probe.ts");
    expect(messages.filter((m) => m.ruleId === "no-restricted-syntax")).toEqual([]);
  });

  it("kestrel/admin-api-routes: bans a route built by spreading another route and overriding path", async () => {
    const messages = await lintVirtual("const route = { ...LAYER_ROUTES.ready, path: '/users' };\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "spreading another route");
  });

  it("kestrel/admin-api-routes: bans importing useApi under a renamed local binding", async () => {
    const messages = await lintVirtual("import { useApi as client } from './useApi';\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "Do not import useApi");
  });

  it("kestrel/admin-api-routes: bans a raw $fetch call", async () => {
    const messages = await lintVirtual("await $fetch('/users');\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: bans $fetch.create", async () => {
    const messages = await lintVirtual("const client = $fetch.create({ baseURL: '/api' });\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: bans useFetch()", async () => {
    const messages = await lintVirtual("const { data } = useFetch('/api/users');\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: bans new XMLHttpRequest()", async () => {
    const messages = await lintVirtual("const xhr = new XMLHttpRequest();\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: bans a call through globalThis.$fetch", async () => {
    const messages = await lintVirtual("await globalThis.$fetch('/users');\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: bans globalThis.$fetch.create", async () => {
    const messages = await lintVirtual("const client = globalThis.$fetch.create({ baseURL: '/api' });\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: bans a plain fetch() call", async () => {
    const messages = await lintVirtual("await fetch('/users');\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "never $fetch");
  });

  it("kestrel/admin-api-routes: allows $fetch.create inside admin-client.ts, which installs the interceptor", async () => {
    const messages = await lintVirtual("globalThis.$fetch = globalThis.$fetch.create({});\n", "layers/admin/app/utils/admin-client.ts");
    expect(messages.filter((m) => m.ruleId === "no-restricted-syntax")).toEqual([]);
  });

  it("kestrel/admin-api-routes: bans importing MOUNT_PATH outside the route-building files", async () => {
    const messages = await lintVirtual("import { MOUNT_PATH } from '#kestrel-core/mount-path';\n", "layers/admin/app/composables/probe.ts");
    expectMessage(messages, "no-restricted-syntax", "routing primitive");
  });

  it("kestrel/admin-api-routes: allows importing MOUNT_PATH inside utils/capabilities.ts", async () => {
    const messages = await lintVirtual("import { MOUNT_PATH } from '#kestrel-core/mount-path';\n", "layers/admin/app/utils/capabilities.ts");
    expect(messages.filter((m) => m.ruleId === "no-restricted-syntax")).toEqual([]);
  });
});
