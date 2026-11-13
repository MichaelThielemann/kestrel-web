import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { idOf, isRecord, type Api, type Json } from "../../support/api.ts";
import { SITE_DIR, SITE_URL } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

const INDEX_DEADLINE_MS = 10_000;
const RENDER_DEADLINE_MS = 30_000;
const SEEDED_TITLE = "Kestrel Beispiel";
const TITLE_WITH_AMPERSAND = "Kestrel Beispiel & Partner";

const siteFile = (name: string): string => {
  const file = join(SITE_DIR, name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};
const pageFile = (path: string): string => join(SITE_DIR, path === "/" ? "" : path.slice(1), "index.html");
const decode = (value: string): string => value.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

function exportedPaths(dir = SITE_DIR, prefix = ""): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === "index.html") paths.push(prefix === "" ? "/" : prefix);
    } else if (prefix !== "" || (entry !== "_nuxt" && entry !== "media")) {
      paths.push(...exportedPaths(full, `${prefix}/${entry}`));
    }
  }
  return paths.sort();
}

const sitemapLocs = (): string[] => [...siteFile("sitemap.xml").matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => decode(match[1] ?? ""));

function headValue(html: string, tag: "link" | "meta", key: string, value: string, read: string): string | undefined {
  for (const match of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))) {
    if (!match[0].includes(` ${key}="${value}"`)) continue;
    const found = new RegExp(`\\s${read}="([^"]*)"`).exec(match[0]);
    return found?.[1] === undefined ? undefined : decode(found[1]);
  }
  return undefined;
}

const primaryPaths = (): string[] => exportedPaths().filter((path) => path !== "/en" && !path.startsWith("/en/"));
const pagesWithoutSiteName = (name: string): string[] =>
  primaryPaths().filter((path) => headValue(readFileSync(pageFile(path), "utf8"), "meta", "property", "og:site_name", "content") !== name);

function withoutResolvedPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutResolvedPaths);
  if (!isRecord(value)) return value;
  const internal = value.type === "internal";
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(internal && key === "path")).map(([key, entry]) => [key, withoutResolvedPaths(entry)]));
}

async function saveSiteTitle(api: Api, title: string): Promise<void> {
  const current = await api.call("GET", "/settings?locale=de");
  const fields: Json = {};
  for (const [key, value] of Object.entries(current)) {
    if (!key.startsWith("_") && key !== "id" && key !== "createdAt" && key !== "updatedAt") fields[key] = withoutResolvedPaths(value);
  }
  await api.call("PUT", "/settings", { ...fields, locale: "de", title });
}

test("a published page reaches sitemap.xml, robots.txt and llms.txt within ten seconds, and leaves them when it is deleted", async ({ adminApi }) => {
  const loc = `${SITE_URL}/frisch`;
  const id = idOf(await adminApi.call("POST", "/pages", {
    locale: "de",
    slug: "frisch",
    title: "Frisch veröffentlicht",
    status: "published",
    body: [{ id: "f1", type: "prose", props: { body: "<p>Ein ganz neuer Absatz.</p>" } }],
  }));

  await expect.poll(sitemapLocs, { timeout: INDEX_DEADLINE_MS }).toContain(loc);
  await expect.poll(() => siteFile("llms.txt"), { timeout: INDEX_DEADLINE_MS }).toContain(`[Frisch veröffentlicht](${loc})`);
  expect(siteFile("robots.txt")).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  await expect.poll(() => siteFile("llms-full.txt"), { timeout: RENDER_DEADLINE_MS }).toContain("Ein ganz neuer Absatz.");

  const locs = sitemapLocs();
  expect(locs.map((entry) => entry.slice(SITE_URL.length) || "/").sort()).toEqual(exportedPaths());
  for (const entry of locs) {
    const html = readFileSync(pageFile(entry.slice(SITE_URL.length) || "/"), "utf8");
    expect(headValue(html, "link", "rel", "canonical", "href"), entry).toBe(entry);
    expect(headValue(html, "meta", "property", "og:url", "content"), entry).toBe(entry);
  }

  await adminApi.call("DELETE", `/pages/${id}`);
  await expect.poll(sitemapLocs, { timeout: INDEX_DEADLINE_MS }).not.toContain(loc);
  await expect.poll(() => siteFile("llms.txt"), { timeout: INDEX_DEADLINE_MS }).not.toContain(loc);
  expect(existsSync(pageFile("/frisch"))).toBe(false);
  await expect.poll(() => siteFile("llms-full.txt"), { timeout: RENDER_DEADLINE_MS }).not.toContain("Ein ganz neuer Absatz.");
});

test("a site title with an ampersand reaches every exported page of its locale and both llms files", async ({ adminApi }) => {
  await saveSiteTitle(adminApi, TITLE_WITH_AMPERSAND);
  try {
    await expect.poll(() => siteFile("llms.txt"), { timeout: INDEX_DEADLINE_MS }).toMatch(/^# Kestrel Beispiel & Partner\n/);
    await expect.poll(() => pagesWithoutSiteName(TITLE_WITH_AMPERSAND), { timeout: RENDER_DEADLINE_MS }).toEqual([]);
    await expect.poll(() => siteFile("llms-full.txt"), { timeout: RENDER_DEADLINE_MS }).toMatch(/^# Kestrel Beispiel & Partner\n/);
    expect(primaryPaths().length).toBeGreaterThan(3);
    expect(decode(/<title>([^<]*)<\/title>/.exec(readFileSync(pageFile("/"), "utf8"))?.[1] ?? "")).toContain(TITLE_WITH_AMPERSAND);
  } finally {
    await saveSiteTitle(adminApi, SEEDED_TITLE);
  }
  await expect.poll(() => pagesWithoutSiteName(SEEDED_TITLE), { timeout: RENDER_DEADLINE_MS }).toEqual([]);
});
