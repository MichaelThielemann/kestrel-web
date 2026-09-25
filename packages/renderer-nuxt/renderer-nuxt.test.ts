import { describe, expect, it, vi } from "vitest";
import { rendererContractTests } from "@michaelthielemann/kestrel-contracts/renderer.contract.test";
import { expectErr, expectOk } from "@michaelthielemann/kestrel-contracts/testing/result";
import { createRendererNuxt, type Config } from "./impl.ts";
import type { NuxtTarget } from "./registry.ts";
import { BUILD_ATTRIBUTE, DELIVERY_ATTRIBUTE, STATIC_DELIVERY } from "./static-marker.ts";

const config: Config = { assets: true };

const assetFiles: Record<string, { body: string; type: string }> = {
  "/_nuxt/a.js": { body: "export const a=1", type: "text/javascript" },
  "/_nuxt/builds/meta/x.json": { body: "{}", type: "application/json" },
  "/_nuxt/logo.svg": { body: "<svg/>", type: "" },
  "/foo/_assets/a.js": { body: "export const a=1", type: "text/javascript" },
};

function stub(overrides: Partial<NuxtTarget> = {}): NuxtTarget {
  return {
    fetch(path) {
      const file = assetFiles[path];
      if (file) return Promise.resolve(new Response(file.body, { headers: { "content-type": file.type } }));
      if (path === "/missing" || path === "/_nuxt/missing.js") return Promise.resolve(new Response("nope", { status: 404 }));
      if (path === "/unavailable" || path === "/_nuxt/unavailable.js") return Promise.resolve(new Response("nope", { status: 503 }));
      return Promise.resolve(new Response(page(path), { headers: { "content-type": "text/html" } }));
    },
    ...overrides,
  };
}

function page(path: string, payload = '<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">[{"path":1},"/x"]</script>'): string {
  return `<!DOCTYPE html><html lang="de" data-kestrel-build="b1"><head><title>t</title></head><body><div id="__nuxt">${path}</div>${payload}</body></html>`;
}

function serving(html: string, overrides: Partial<NuxtTarget> = {}): NuxtTarget {
  return stub({
    fetch(path) {
      if (path.startsWith("/_nuxt/")) return stub().fetch(path);
      return Promise.resolve(new Response(html, { headers: { "content-type": "text/html" } }));
    },
    ...overrides,
  });
}

rendererContractTests(() => Promise.resolve(createRendererNuxt(config, () => stub())));

describe("renderer/nuxt", () => {
  const input = { type: "pages", id: "p1", locale: "de", path: "/kontakt", format: "html", document: { id: "p1" } };
  const paths = (out: { assets?: { path: string }[] }) => (out.assets ?? []).map((a) => a.path).sort();

  it("returns RENDER_FAILED when the target is a dev server, without fetching the page", async () => {
    const fetch = vi.fn(stub().fetch);
    const result = await createRendererNuxt(config, () => stub({ dev: true, fetch })).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/production build/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns RENDER_FAILED when the markup contains dev-server source URLs", async () => {
    const target = stub({
      fetch() {
        return Promise.resolve(new Response('<script type="module" src="/_nuxt/@fs/repo/app.vue?vue&type=script"></script>', { headers: { "content-type": "text/html" } }));
      },
    });
    const result = await createRendererNuxt(config, () => target).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/production build/);
  });

  it("returns RENDER_FAILED when the page does not render", async () => {
    const result = await createRendererNuxt(config, () => stub()).render({ ...input, path: "/missing" });
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/404/);
  });

  it("returns TRANSIENT when the page responds 502/503/504", async () => {
    const result = await createRendererNuxt(config, () => stub()).render({ ...input, path: "/unavailable" });
    expect(expectErr(result, "TRANSIENT").message).toMatch(/503/);
  });

  it("returns TRANSIENT when the page fetch rejects", async () => {
    const target = stub({
      fetch() {
        return Promise.reject(new Error("network down"));
      },
    });
    const result = await createRendererNuxt(config, () => target).render(input);
    expect(expectErr(result, "TRANSIENT").message).toMatch(/kontakt/);
  });

  it("returns RENDER_FAILED when no Nuxt app was registered", async () => {
    const result = await createRendererNuxt(config).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/setNuxtRenderer/);
  });

  it("ships the assets named in the build manifest, falling back to a type by extension", async () => {
    const target = stub({ buildAssets: { dir: "/_nuxt/", paths: ["a.js", "builds/meta/x.json", "logo.svg"] } });
    const out = expectOk(await createRendererNuxt(config, () => target).render(input));
    expect((out.assets ?? []).map((a) => ({ path: a.path, contentType: a.contentType })).sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "_nuxt/a.js", contentType: "text/javascript" },
      { path: "_nuxt/builds/meta/x.json", contentType: "application/json" },
      { path: "_nuxt/logo.svg", contentType: "image/svg+xml" },
    ]);
  });

  it("fetches pages and assets under the app baseURL but keys assets site-relative", async () => {
    const fetch = vi.fn(stub().fetch);
    const target = stub({ fetch, baseURL: "/foo/", buildAssets: { dir: "_assets", paths: ["a.js"] } });
    const out = expectOk(await createRendererNuxt(config, () => target).render(input));
    expect(paths(out)).toEqual(["_assets/a.js"]);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/foo/kontakt", "/foo/_assets/a.js"]);
    expect(out.data).toContain("/foo/kontakt");
  });

  it("reuses the cached assets on the next render and hands out a fresh array", async () => {
    const fetch = vi.fn(stub().fetch);
    const target = stub({ buildAssets: { dir: "/_nuxt/", paths: ["a.js"] }, fetch });
    const renderer = createRendererNuxt(config, () => target);
    const first = expectOk(await renderer.render(input));
    const second = expectOk(await renderer.render(input));
    expect(fetch.mock.calls.filter((call) => call[0] === "/_nuxt/a.js")).toHaveLength(1);
    expect(second.assets).not.toBe(first.assets);
    expect(second.assets).toEqual(first.assets);
  });

  it("runs one sync for overlapping renders", async () => {
    const fetch = vi.fn(stub().fetch);
    const target = stub({ buildAssets: { dir: "/_nuxt/", paths: ["a.js"] }, fetch });
    const renderer = createRendererNuxt(config, () => target);
    await Promise.all([renderer.render(input), renderer.render(input), renderer.render(input)]);
    expect(fetch.mock.calls.filter((call) => call[0] === "/_nuxt/a.js")).toHaveLength(1);
  });

  it("retries a failed asset sync on the next render", async () => {
    const target = stub({ buildAssets: { dir: "/_nuxt/", paths: ["missing.js"] } });
    const renderer = createRendererNuxt(config, () => target);
    const failed = await renderer.render(input);
    expect(expectErr(failed, "RENDER_FAILED").message).toMatch(/build asset/);
    target.buildAssets = { dir: "/_nuxt/", paths: ["a.js"] };
    expect(paths(expectOk(await renderer.render(input)))).toEqual(["_nuxt/a.js"]);
  });

  it("rejects an empty manifest instead of publishing a page without assets", async () => {
    const target = stub({ buildAssets: { dir: "/_nuxt/", paths: [] } });
    const result = await createRendererNuxt(config, () => target).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/manifest is empty/);
  });

  it("ships no assets when the config disables them", async () => {
    const target = stub({ buildAssets: { dir: "/_nuxt/", paths: ["a.js"] } });
    const out = expectOk(await createRendererNuxt({ assets: false }, () => target).render(input));
    expect(out.assets).toBeUndefined();
  });

  it("ships no assets when the target has no build manifest", async () => {
    const out = expectOk(await createRendererNuxt(config, () => stub()).render(input));
    expect(out.assets).toBeUndefined();
  });

  it("marks the page as statically delivered once, on the <html> element, and keeps the rest byte for byte", async () => {
    const html = page("/kontakt");
    const out = expectOk(await createRendererNuxt(config, () => serving(html)).render(input));
    const data = String(out.data);
    expect(data.match(/data-kestrel-delivery="static"/g)).toHaveLength(1);
    expect(data).toMatch(/^<!DOCTYPE html><html data-kestrel-delivery="static" lang="de" data-kestrel-build="b1">/);
    expect(data.replace(' data-kestrel-delivery="static"', "")).toBe(html);
  });

  it("marks the first <html> tag only, whatever its case", async () => {
    const html = '<!doctype html><HTML><head></head><body><p>&lt;html&gt;</p><script type="application/json" data-ssr="true" id="__NUXT_DATA__">[{}]</script></body></HTML>';
    const out = expectOk(await createRendererNuxt(config, () => serving(html)).render(input));
    expect(String(out.data)).toBe(html.replace("<HTML>", '<HTML data-kestrel-delivery="static">'));
  });

  it("returns RENDER_FAILED when the markup has no <html> element", async () => {
    const result = await createRendererNuxt(config, () => serving('<body><script type="application/json" id="__NUXT_DATA__">[{}]</script></body>')).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/no <html> element/);
  });

  it("returns RENDER_FAILED when the page embeds no payload", async () => {
    const result = await createRendererNuxt(config, () => serving(page("/kontakt", ""))).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/__NUXT_DATA__/);
  });

  it("returns RENDER_FAILED when the page was not rendered on the server", async () => {
    const html = page("/kontakt", '<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="false" id="__NUXT_DATA__">[{}]</script>');
    const result = await createRendererNuxt(config, () => serving(html)).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/not rendered on the server/);
  });

  it("returns RENDER_FAILED when the payload lives in a separate file, as with an isr or cache route rule", async () => {
    const html = page("/kontakt", '<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__" data-src="/kontakt/_payload.json?abc">[{}]</script>');
    const result = await createRendererNuxt(config, () => serving(html)).render(input);
    expect(expectErr(result, "RENDER_FAILED").message).toMatch(/_payload\.json|separate file/);
  });

  it("fetches the page and every asset with the path as its only argument, so no request data reaches the render", async () => {
    const fetch = vi.fn(stub().fetch);
    const target = stub({ fetch, buildAssets: { dir: "/_nuxt/", paths: ["a.js", "logo.svg"] } });
    expectOk(await createRendererNuxt(config, () => target).render(input));
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const call of fetch.mock.calls) {
      expect(call).toHaveLength(1);
      expect(typeof call[0]).toBe("string");
    }
  });
});

describe("renderer/nuxt static-marker", () => {
  it("names the delivery and build attributes and the static value", () => {
    expect(DELIVERY_ATTRIBUTE).toBe("data-kestrel-delivery");
    expect(STATIC_DELIVERY).toBe("static");
    expect(BUILD_ATTRIBUTE).toBe("data-kestrel-build");
  });
});
