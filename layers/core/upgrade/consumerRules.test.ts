import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { privateFieldsRule, publishAllRule, routeCacheRule, settingsKeyRule, unstableKeyRule } from "./consumerRules";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): SourceRuleContext {
  const root = mkdtempSync(join(tmpdir(), "kestrel-web-consumer-rules-"));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return {
    root,
    scratch: root,
    readFile: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return undefined;
      }
    },
    answers: new Map(),
  };
}

const DELIVERY_MODEL = 'export const features = ["delivery", "images"] as const satisfies readonly Feature[];\n';

describe("settingsKeyRule", () => {
  it('flags refreshNuxtData("site:settings") in a .ts composable', async () => {
    const ctx = projectWith({ "app/composables/useThing.ts": 'refreshNuxtData("site:settings")\n' });
    const findings = await settingsKeyRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("refreshNuxtData");
    expect(findings[0]?.fix.kind).toBe("manual");
  });

  it('flags clearNuxtData("site:settings") inside a .vue <script setup>', async () => {
    const ctx = projectWith({ "app/pages/foo.vue": '<script setup lang="ts">\nclearNuxtData("site:settings")\n</script>\n<template><div /></template>\n' });
    const findings = await settingsKeyRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("clearNuxtData");
  });

  it("does nothing once the key already carries the locale", async () => {
    const ctx = projectWith({ "app/composables/useThing.ts": 'useNuxtData("site:settings:de")\n' });
    expect(await settingsKeyRule.check(ctx)).toEqual([]);
  });

  it("does nothing without app/ at all", async () => {
    const ctx = projectWith({ "shared/model.ts": DELIVERY_MODEL });
    expect(await settingsKeyRule.check(ctx)).toEqual([]);
  });
});

describe("unstableKeyRule", () => {
  it("flags a useAsyncData key built from a useId() value", async () => {
    const ctx = projectWith({ "app/pages/foo.vue": '<script setup lang="ts">\nconst id = useId()\nuseAsyncData(`foo:${id}`, () => fetchFoo())\n</script>\n' });
    const findings = await unstableKeyRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("useId()");
    expect(findings[0]?.fix.kind).toBe("none");
  });

  it("flags a fixed useFetch key next to a watch on useSiteLocale()", async () => {
    const ctx = projectWith({ "app/composables/useThing.ts": 'useFetch("foo", { watch: [useSiteLocale()] })\n' });
    const findings = await unstableKeyRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("useSiteLocale()");
  });

  it("does nothing for a deterministic key with no useId() and no locale watch", async () => {
    const ctx = projectWith({ "app/composables/useThing.ts": 'useAsyncData(`foo:${props.id}:${locale.value}`, () => fetchFoo())\n' });
    expect(await unstableKeyRule.check(ctx)).toEqual([]);
  });
});

describe("routeCacheRule", () => {
  it("flags isr/cache/swr on a page route once delivery is on", async () => {
    const ctx = projectWith({
      "shared/model.ts": DELIVERY_MODEL,
      "nuxt.config.ts": 'export default defineNuxtConfig({ routeRules: { "/about/**": { isr: 60 } } })\n',
    });
    const findings = await routeCacheRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('routeRules["/about/**"]');
    expect(findings[0]?.message).toContain('"isr"');
  });

  it("does nothing for a reserved prefix (/api, /media, /admin, /_preview, /_nuxt)", async () => {
    const ctx = projectWith({
      "shared/model.ts": DELIVERY_MODEL,
      "nuxt.config.ts": 'export default defineNuxtConfig({ routeRules: { "/api/**": { cache: true } } })\n',
    });
    expect(await routeCacheRule.check(ctx)).toEqual([]);
  });

  it("does nothing once delivery is not a feature", async () => {
    const ctx = projectWith({
      "shared/model.ts": 'export const features = ["images"] as const satisfies readonly Feature[];\n',
      "nuxt.config.ts": 'export default defineNuxtConfig({ routeRules: { "/about/**": { isr: 60 } } })\n',
    });
    expect(await routeCacheRule.check(ctx)).toEqual([]);
  });

  it("does nothing for a route rule that explicitly turns caching off (isr: false, cache: false)", async () => {
    const ctx = projectWith({
      "shared/model.ts": DELIVERY_MODEL,
      "nuxt.config.ts": 'export default defineNuxtConfig({ routeRules: { "/about/**": { isr: false }, "/contact": { cache: false } } })\n',
    });
    expect(await routeCacheRule.check(ctx)).toEqual([]);
  });
});

const OLD_LAYER_PACKAGE_JSON = '{ "dependencies": { "@michaelthielemann/kestrel-web": "^2.0.0" } }';
const NEW_LAYER_PACKAGE_JSON = '{ "dependencies": { "@michaelthielemann/kestrel-web": "^3.0.0" } }';

describe("publishAllRule", () => {
  it("tells, once delivery is on and the layer is still on its 2.x range, that the first start re-renders every page and nothing needs running", async () => {
    const ctx = projectWith({ "shared/model.ts": DELIVERY_MODEL, "package.json": OLD_LAYER_PACKAGE_JSON });
    const findings = await publishAllRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
    expect(findings[0]?.suggestion).toContain("the first start of the upgraded build re-renders every published page in the background");
    expect(findings[0]?.suggestion).not.toContain("run Publish all");
    expect(findings[0]?.fix.kind).toBe("none");
  });

  it("says nothing without the delivery feature", async () => {
    const ctx = projectWith({ "shared/model.ts": 'export const features = ["images"] as const satisfies readonly Feature[];\n', "package.json": OLD_LAYER_PACKAGE_JSON });
    expect(await publishAllRule.check(ctx)).toEqual([]);
  });

  it("says nothing once the layer is already on its 3.x range (the reminder is one-time)", async () => {
    const ctx = projectWith({ "shared/model.ts": DELIVERY_MODEL, "package.json": NEW_LAYER_PACKAGE_JSON });
    expect(await publishAllRule.check(ctx)).toEqual([]);
  });
});

describe("privateFieldsRule", () => {
  it("flags a private field read off a useMediaItem() result (destructured data)", async () => {
    const ctx = projectWith({
      "app/pages/foo.vue": '<script setup lang="ts">\nconst { data: media } = useMediaItem(() => id, locale)\nconsole.log(media.value.folder)\n</script>\n',
    });
    const findings = await privateFieldsRule.check(ctx);
    expect(findings.map((f) => f.message).join("\n")).toContain('"folder"');
  });

  it("flags a variant's state read off a tracked media item", async () => {
    const ctx = projectWith({
      "app/pages/foo.vue": '<script setup lang="ts">\nconst media = useMediaItem(() => id, locale)\nconsole.log(media.value.variants[0].state)\n</script>\n',
    });
    const findings = await privateFieldsRule.check(ctx);
    expect(findings.map((f) => f.message).join("\n")).toContain("variants[].state");
  });

  it("does not flag the same field name on an object the layer never loaded", async () => {
    const ctx = projectWith({
      "app/pages/foo.vue": '<script setup lang="ts">\nconst entry = useEntry()\nconsole.log(entry.value.createdAt, entry.value.folder)\n</script>\n',
    });
    expect(await privateFieldsRule.check(ctx)).toEqual([]);
  });

  it("flags a page timestamp read off useSitePage()", async () => {
    const ctx = projectWith({
      "app/components/PageDate.vue": '<script setup lang="ts">\nconst page = useSitePage()\nconst stamp = computed(() => page.value?.updatedAt)\n</script>\n',
    });
    const findings = await privateFieldsRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('"updatedAt"');
    expect(findings[0]?.message).toContain("page");
    expect(findings[0]?.severity).toBe("info");
    expect(findings[0]?.fix.kind).toBe("none");
  });

  it("flags a page timestamp read off the page data under a site: key", async () => {
    const ctx = projectWith({
      "app/composables/usePageDate.ts": "export function usePageDate(path: string) {\n  const { data } = useNuxtData(`site:${path}`)\n  return data.value?.createdAt\n}\n",
    });
    const findings = await privateFieldsRule.check(ctx);
    expect(findings.map((f) => f.message).join("\n")).toContain('"createdAt"');
  });

  it("flags a page timestamp read off a value typed PageDocument, and leaves the settings key alone", async () => {
    const ctx = projectWith({
      "app/utils/stamp.ts": "import type { PageDocument } from '#kestrel-core/app/types/api'\nexport function stamp(page: PageDocument | null): number | undefined {\n  return page?.updatedAt\n}\n",
      "app/utils/settings.ts": "export function title() {\n  const { data } = useNuxtData('site:settings:de')\n  return data.value?.updatedAt\n}\n",
    });
    const findings = await privateFieldsRule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.where.file).toContain("stamp.ts");
  });
});
