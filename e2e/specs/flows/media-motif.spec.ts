import { readFileSync } from "node:fs";
import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import { centredCrop, type Framing, type PixelCrop, type Rect } from "@michaelthielemann/kestrel-images-default/framing";
import { idOf, isRecord, until, type Api, type Json } from "../../support/api.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";
import { numberedGrid, rasterPng } from "../../support/png.ts";
import { readProbes, shownCrop, showsRaster } from "../../support/pixels.ts";

test.use({ storageState: ADMIN_STATE });

const TURNED_JPEG = readFileSync(new URL("../../fixtures/numbered-grid-turned.jpg", import.meta.url));
const RASTER = numberedGrid();
const WIDTH = RASTER.width;
const HEIGHT = RASTER.height;
const MOTIF_FOCUS: Rect = { x: 0.6, y: 0, w: 0.2, h: 0.2 };
const WIDE = { size: "hero-wide", key: "16:9" };
const TALL = { size: "hero-tall", key: "3:4" };
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const SCHEMES = ["light", "dark"] as const;

const UPLOADS = [
  { name: "motif-grid.png", slug: "rasterbild-png", bytes: () => rasterPng(RASTER) },
  { name: "motif-turned.jpg", slug: "rasterbild-jpeg", bytes: () => TURNED_JPEG },
];

interface Variant {
  size: string;
  state: string;
  path: string;
  width: number;
  crop: PixelCrop | null;
}

function isRect(value: unknown): value is Rect {
  return isRecord(value) && ["x", "y", "w", "h"].every((key) => typeof value[key] === "number");
}

function isPixelCrop(value: unknown): value is PixelCrop {
  return isRecord(value) && ["left", "top", "width", "height"].every((key) => typeof value[key] === "number");
}

async function variantsOf(api: Api, id: string): Promise<{ item: Json; variants: Variant[] }> {
  const item = await api.call("GET", `/media/${id}`);
  const variants: Variant[] = [];
  for (const entry of Array.isArray(item.variants) ? item.variants : []) {
    if (isRecord(entry) && typeof entry.size === "string" && typeof entry.state === "string" && typeof entry.path === "string" && typeof entry.width === "number") {
      variants.push({ size: entry.size, state: entry.state, path: entry.path, width: entry.width, crop: isPixelCrop(entry.crop) ? entry.crop : null });
    }
  }
  return { item, variants };
}

function sameEdges(a: PixelCrop | null, b: PixelCrop | null): boolean {
  if (a === null || b === null) return a === b;
  return [a.left - b.left, a.top - b.top, a.left + a.width - b.left - b.width, a.top + a.height - b.top - b.height].every((delta) => Math.abs(delta) <= 1);
}

async function shown(locator: Locator): Promise<{ png: Buffer; width: number }> {
  const box = await locator.boundingBox();
  return { png: await locator.screenshot(), width: box?.width ?? 0 };
}

async function attachMatrix(page: Page, target: Locator, testInfo: TestInfo, name: string): Promise<void> {
  const original = page.viewportSize();
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await testInfo.attach(`${name}-${scheme}-${viewport.width}`, { body: await target.screenshot(), contentType: "image/png" });
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  if (original) await page.setViewportSize(original);
}

async function setFocus(editor: Locator, rect: { x: number; y: number; w: number; h: number }): Promise<void> {
  for (const [label, value] of [["Links", rect.x], ["Oben", rect.y], ["Breite", rect.w], ["Höhe", rect.h]] as const) {
    const input = editor.getByRole("spinbutton", { name: label, exact: true });
    await input.focus();
    await input.press("ControlOrMeta+a");
    await input.pressSequentially(String(value));
    await input.press("Tab");
  }
}

async function visitPage(browser: Browser, baseURL: string | undefined, slug: string, viewport: { width: number; height: number }, scheme: (typeof SCHEMES)[number], testInfo: TestInfo, expectSource: string, crop: PixelCrop): Promise<void> {
  const context = await browser.newContext({ baseURL, viewport, colorScheme: scheme });
  const visit = await context.newPage();
  await visit.goto(`/${slug}`);
  const image = visit.locator(".block-hero__image");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.currentSrc)).toContain(expectSource);
  const { png, width } = await shown(image);
  const read = await readProbes(visit, { png });
  expect(showsRaster(RASTER, crop, read, width), `${slug} at ${viewport.width} px shows the cells of its ${expectSource} cut`).toBe(true);
  await testInfo.attach(`${slug}-page-${scheme}-${viewport.width}`, { body: await visit.screenshot({ fullPage: true }), contentType: "image/png" });
  await context.close();
}

for (const upload of UPLOADS) {
  test(`${upload.name}: its cells agree in the focus previews, the crop tiles, the delivered variants and the art-directed page`, async ({ page, browser, baseURL, adminApi, visitor }, testInfo) => {
    const id = idOf(await adminApi.upload(upload.name, upload.bytes()));
    await until(`the variants of ${upload.name}`, async () => {
      const { item, variants } = await variantsOf(adminApi, id);
      const framing = isRecord(item.framing) ? item.framing : {};
      const done = (size: string): boolean => variants.some((variant) => variant.size === size && variant.state === "done");
      return framing.width === WIDTH && framing.height === HEIGHT && ["medium", WIDE.size, TALL.size].every(done);
    });
    await adminApi.call("POST", "/pages", { locale: "de", slug: upload.slug, title: "Rasterbild", status: "published", body: [{ id: "h1", type: "hero", props: { heading: "Rasterbild", image: id } }] });

    await page.goto("/admin/media");
    const whole = (await variantsOf(adminApi, id)).variants.find((variant) => variant.size === "medium");
    expect(whole?.crop).toBeNull();
    await expect(async () => {
      const upright = await readProbes(page, { url: whole?.path ?? "" });
      expect(showsRaster(RASTER, { left: 0, top: 0, width: WIDTH, height: HEIGHT }, upright, whole?.width ?? 1)).toBe(true);
    }).toPass();

    await page.getByRole("button", { name: new RegExp(`^${upload.name.replace(".", "\\.")}`) }).dblclick();
    await page.getByRole("dialog", { name: upload.name }).getByRole("button", { name: "Ausschnitt anpassen" }).click();
    const editor = page.getByRole("dialog", { name: `Ausschnitt: ${upload.name}` });
    await expect(editor.getByRole("tab", { name: "Fokus" })).toBeFocused();

    await expect.poll(() => editor.locator(".ui-rect-select__image").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const editorImage = await shown(editor.locator(".ui-rect-select__image"));
    expect(showsRaster(RASTER, { left: 0, top: 0, width: WIDTH, height: HEIGHT }, await readProbes(page, { png: editorImage.png }), editorImage.width), "the focus tab shows the whole picture upright").toBe(true);

    await setFocus(editor, { x: 60, y: 0, w: 20, h: 20 });
    const focused: Framing = { focus: MOTIF_FOCUS, crops: {} };
    for (const { key } of [WIDE, TALL]) {
      const preview = editor.locator('[data-test="crop-preview"]').filter({ hasText: key }).locator(".media-crop-preview");
      await expect.poll(() => preview.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const { png, width } = await shown(preview);
      const read = await readProbes(page, { png });
      expect(showsRaster(RASTER, shownCrop(focused, key, WIDTH, HEIGHT), read, width), `the ${key} preview follows the focus`).toBe(true);
      const centred = centredCrop(key, WIDTH, HEIGHT);
      expect(centred && showsRaster(RASTER, centred, read, width), `the ${key} preview is not the centred cut`).toBe(false);
    }
    await attachMatrix(page, editor, testInfo, `${upload.slug}-focus`);

    await editor.getByRole("tab", { name: "Feinschnitt" }).click();
    await editor.getByRole("button", { name: new RegExp(`^${TALL.key}`) }).click();
    const detail = editor.locator('[data-test="crop-detail"]');
    await detail.getByRole("group", { name: `Zuschnitt für ${TALL.key}` }).focus();
    await page.keyboard.press("+");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(detail.locator('[data-test="crop-state"]')).toHaveText("Manuell");
    const tile = editor.locator(`.media-crop-tiles__tile[data-key="${TALL.key}"] .media-crop-preview`);
    await expect.poll(() => tile.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const tileShot = await shown(tile);
    await attachMatrix(page, editor, testInfo, `${upload.slug}-crop`);

    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `/api/media/${id}/framing`);
    await editor.getByRole("button", { name: "Speichern" }).click();
    const answer = await saved;
    expect(answer.status()).toBe(200);
    const body: unknown = await answer.json();
    const answered = isRecord(body) && isRecord(body.framing) ? body.framing : {};
    const crops = isRecord(answered.crops) ? answered.crops : {};
    const manual = crops[TALL.key];
    expect(isRect(manual)).toBe(true);
    const framing: Framing = { focus: isRect(answered.focus) ? answered.focus : null, crops: isRect(manual) ? { [TALL.key]: manual } : {} };
    expect(framing.focus).toEqual(MOTIF_FOCUS);

    const tallCrop = shownCrop(framing, TALL.key, WIDTH, HEIGHT);
    const wideCrop = shownCrop(framing, WIDE.key, WIDTH, HEIGHT);
    expect(showsRaster(RASTER, tallCrop, await readProbes(page, { png: tileShot.png }), tileShot.width), "the 3:4 tile shows the manual crop").toBe(true);

    let delivered: Variant[] = [];
    await until("the cover variants to render with the saved framing", async () => {
      delivered = (await variantsOf(adminApi, id)).variants;
      const ready = (size: string, key: string, crop: PixelCrop): boolean => delivered.some((variant) => variant.size === size && variant.state === "done" && sameEdges(variant.crop ?? centredCrop(key, WIDTH, HEIGHT), crop));
      return ready(WIDE.size, WIDE.key, wideCrop) && ready(TALL.size, TALL.key, tallCrop);
    });
    for (const [variantSize, crop] of [[WIDE.size, wideCrop], [TALL.size, tallCrop]] as const) {
      const variant = delivered.find((entry) => entry.size === variantSize);
      const read = await readProbes(page, { url: variant?.path ?? "" });
      expect(showsRaster(RASTER, crop, read, variant?.width ?? 1), `the delivered ${variantSize} variant shows the cells of its crop`).toBe(true);
    }

    const tallPath = delivered.find((entry) => entry.size === TALL.size)?.path ?? "";
    await expect.poll(async () => (await visitor.get(`/${upload.slug}`)).text(), { timeout: 60_000 }).toContain(tallPath);
    const html = await (await visitor.get(`/${upload.slug}`)).text();
    expect(html).toMatch(/<picture>(?:<!--[^>]*-->)*<source[^>]*media="\(min-width: 48rem\)"[^>]*>(?:<!--[^>]*-->)*<img\b/);

    for (const scheme of SCHEMES) {
      await visitPage(browser, baseURL, upload.slug, VIEWPORTS[0] ?? { width: 1440, height: 900 }, scheme, testInfo, WIDE.size, wideCrop);
      await visitPage(browser, baseURL, upload.slug, VIEWPORTS[1] ?? { width: 390, height: 844 }, scheme, testInfo, TALL.size, tallCrop);
    }
  });
}

test("the box of the hero keeps its planned ratio while the variants still serve the original", async ({ browser, baseURL, adminApi }, testInfo) => {
  const original = rasterPng(RASTER);
  const id = idOf(await adminApi.upload("motif-pending.png", original));
  let served: string[] = [];
  await until("the variants of motif-pending.png", async () => {
    const { variants } = await variantsOf(adminApi, id);
    served = variants.map((variant) => variant.path.split("?")[0] ?? "");
    return [WIDE.size, TALL.size].every((size) => variants.some((variant) => variant.size === size && variant.state === "done"));
  });
  await adminApi.call("POST", "/pages", { locale: "de", slug: "rasterbild-pending", title: "Rasterbild", status: "published", body: [{ id: "h1", type: "hero", props: { heading: "Rasterbild", image: id } }] });

  for (const [viewport, ratio] of [[VIEWPORTS[0], 16 / 9], [VIEWPORTS[1], 3 / 4]] as const) {
    const context = await browser.newContext({ baseURL, viewport });
    await context.route((url) => served.includes(url.pathname), (route) => route.fulfill({ status: 200, contentType: "image/png", body: original }));
    const visit = await context.newPage();
    await visit.goto("/rasterbild-pending");
    const image = visit.locator(".block-hero__image");
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = await image.boundingBox();
    expect(box && box.width / box.height, `the hero at ${viewport?.width} px keeps the ratio of its cut`).toBeCloseTo(ratio, 2);
    const pictureHeight = await image.evaluate((img: HTMLImageElement) => img.parentElement?.getBoundingClientRect().height ?? 0);
    expect(pictureHeight, `the picture at ${viewport?.width} px is as high as its image`).toBeCloseTo(box?.height ?? 0, 1);
    await testInfo.attach(`rasterbild-pending-${viewport?.width}`, { body: await visit.screenshot({ fullPage: true }), contentType: "image/png" });
    await context.close();
  }
});
