import { AxeBuilder } from "@axe-core/playwright";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { idOf, isRecord, until, type Api } from "../../support/api.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";
import { gradientPng } from "../../support/png.ts";
import { withExifOrientation } from "../../support/webp.ts";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const COVER_SIZES = ["teaser", "avatar"];

test.use({ storageState: ADMIN_STATE });

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  return results.violations.map((violation) => `${violation.id} (${violation.impact ?? "unknown"}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

async function renderedPaths(api: Api, id: string): Promise<Record<string, string>> {
  const item = await api.call("GET", `/media/${id}`);
  const paths: Record<string, string> = {};
  for (const variant of Array.isArray(item.variants) ? item.variants : []) {
    if (isRecord(variant) && variant.state === "done" && typeof variant.size === "string" && typeof variant.path === "string") paths[variant.size] = variant.path;
  }
  return paths;
}

async function uploadRendered(api: Api, filename: string, color: [number, number, number]): Promise<{ id: string; paths: Record<string, string> }> {
  const id = idOf(await api.upload(filename, gradientPng(1200, 700, color, [240, 240, 240])));
  let paths: Record<string, string> = {};
  await until(`the cover variants of ${filename}`, async () => {
    paths = await renderedPaths(api, id);
    return COVER_SIZES.every((size) => paths[size] !== undefined);
  });
  return { id, paths };
}

async function srcsetSizes(visitor: APIRequestContext, path: string, alt: string): Promise<string[]> {
  const html = await (await visitor.get(path)).text();
  const image = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`alt="${alt}"`)) ?? "";
  const srcset = /\ssrcset="([^"]*)"/.exec(image)?.[1] ?? "";
  return srcset.split(",").flatMap((candidate) => {
    const size = /\/variants\/([a-z][a-z0-9-]*)\.[a-z]+(?:\?v=[^\s]+)?\s+\d+w$/.exec(candidate.trim())?.[1];
    return size === undefined ? [] : [size];
  });
}

async function setFocus(editor: Locator, rect: { x: number; y: number; w: number; h: number }): Promise<void> {
  for (const [label, value] of [["Links", rect.x], ["Oben", rect.y], ["Breite", rect.w], ["Höhe", rect.h]] as const) {
    const input = editor.getByRole("spinbutton", { name: label, exact: true });
    await input.focus();
    await input.press("ControlOrMeta+a");
    await input.pressSequentially(String(value));
    await input.press("Tab");
  }
  for (const [label, value] of [["Links", rect.x], ["Oben", rect.y], ["Breite", rect.w], ["Höhe", rect.h]] as const) {
    await expect(editor.getByRole("spinbutton", { name: label, exact: true })).toHaveValue(String(value));
  }
}

test("the crop editor opened from the media viewer saves a focus and a manual crop, the cover variants get a new versioned path, and the public page keeps the focus in view", async ({ page, browser, baseURL, adminApi, visitor }) => {
  const { id, paths: before } = await uploadRendered(adminApi, "framing-viewer.png", [30, 90, 200]);
  for (const size of COVER_SIZES) expect(before[size]).not.toContain("?v=");
  await adminApi.call("POST", "/pages", { locale: "de", slug: "bildfokus", title: "Bildfokus", status: "published", body: [{ id: "f1", type: "image", props: { image: id, alt: "Ein blauer Verlauf" } }] });
  await expect.poll(async () => (await visitor.get("/bildfokus")).status(), { timeout: 60_000 }).toBe(200);

  await page.goto("/admin/media");
  await page.getByRole("button", { name: /^framing-viewer\.png/ }).dblclick();
  const viewer = page.getByRole("dialog", { name: "framing-viewer.png" });
  await viewer.getByRole("button", { name: "Ausschnitt anpassen" }).click();
  const editor = page.getByRole("dialog", { name: "Ausschnitt: framing-viewer.png" });
  await expect(editor.getByRole("tab", { name: "Fokus" })).toBeFocused();
  await expect(editor.getByText("Gilt für alle Verwendungen dieses Bildes (1).")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Speichern" })).toBeDisabled();

  await setFocus(editor, { x: 60, y: 20, w: 30, h: 40 });
  await expect(editor.getByText("Zuschnitte werden um den Fokus zentriert.")).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await editor.getByRole("tab", { name: "Feinschnitt" }).click();
  await editor.getByRole("button", { name: /^1:1/ }).click();
  const detail = editor.locator('[data-test="crop-detail"]');
  await expect(detail.locator('[data-test="crop-state"]')).toHaveText("Automatisch");
  await detail.getByRole("group", { name: "Zuschnitt für 1:1" }).focus();
  await page.keyboard.press("+");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(detail.locator('[data-test="crop-state"]')).toHaveText("Manuell");
  const zoom = detail.getByRole("spinbutton", { name: "Zoom", exact: true });
  await zoom.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await zoom.pressSequentially("200");
  await expect(zoom).toHaveValue("200");
  await zoom.press("Tab");
  await expect(zoom).toHaveValue("200");
  await expect(detail.getByRole("slider", { name: "Zoom" })).toHaveAttribute("aria-valuetext", "200 %");
  await expect(detail.getByRole("button", { name: "Auf automatisch zurücksetzen" })).toBeEnabled();
  expect(await violations(page)).toEqual([]);

  const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `/api/media/${id}/framing`);
  await editor.getByRole("button", { name: "Speichern" }).click();
  const answer = await saved;
  expect(answer.status()).toBe(200);
  const body: unknown = await answer.json();
  const framing = isRecord(body) && isRecord(body.framing) ? body.framing : {};
  expect(framing.focus).toEqual({ x: 0.6, y: 0.2, w: 0.3, h: 0.4 });
  expect(isRecord(framing.crops) ? Object.keys(framing.crops) : []).toEqual(["1:1"]);
  await expect(editor).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Ausschnitt gespeichert. Geänderte Varianten werden neu berechnet." })).toHaveCount(1);
  await expect(viewer).toBeVisible();

  let after: Record<string, string> = {};
  await until("the cover variants to render with the new crops", async () => {
    after = await renderedPaths(adminApi, id);
    return COVER_SIZES.every((size) => after[size] !== before[size]);
  });
  for (const size of COVER_SIZES) {
    const path = after[size] ?? "";
    expect(path.split("?")[0]).toBe(before[size]);
    expect(path).toMatch(/\?v=[^&]+$/);
    const served = await visitor.get(path);
    expect(served.status(), path).toBe(200);
    expect(served.headers()["content-type"]).toMatch(/^image\//);
  }

  await expect.poll(async () => (await visitor.get("/bildfokus")).text(), { timeout: 60_000 }).toMatch(/object-position:\s*75% 40%/);
  const anonymous = await browser.newContext({ baseURL });
  const visit = await anonymous.newPage();
  await visit.goto("/bildfokus");
  await expect(visit.getByRole("img", { name: "Ein blauer Verlauf" })).toHaveCSS("object-position", "75% 40%");
  await anonymous.close();
});

test("the crop editor opened at the image of a media field changes the image's focus without touching the page", async ({ page, adminApi }) => {
  const { id } = await uploadRendered(adminApi, "framing-field.png", [200, 90, 30]);
  const pageId = idOf(await adminApi.call("POST", "/pages", { locale: "de", slug: "feldfokus", title: "Feldfokus", status: "draft", body: [{ id: "g1", type: "image", props: { image: id, alt: "Ein oranger Verlauf" } }] }));

  await page.goto(`/admin/pages/${pageId}?locale=de`);
  await page.getByRole("button", { name: "Bild", exact: true }).click();
  await page.getByRole("button", { name: "Ausschnitt von framing-field.png anpassen" }).click();
  const editor = page.getByRole("dialog", { name: "Ausschnitt: framing-field.png" });
  await expect(editor.getByText("Gilt für alle Verwendungen dieses Bildes (1).")).toBeVisible();

  const surface = editor.getByRole("group", { name: "Fokusbereich des Bildes" });
  await surface.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(editor.getByRole("spinbutton", { name: "Links", exact: true })).toHaveValue("35");
  expect(await violations(page)).toEqual([]);

  const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `/api/media/${id}/framing`);
  await editor.getByRole("button", { name: "Speichern" }).click();
  expect((await saved).status()).toBe(200);
  await expect(editor).toBeHidden();
  await expect(page.getByRole("button", { name: "Ausschnitt von framing-field.png anpassen" })).toBeFocused();

  const item = await adminApi.call("GET", `/media/${id}`);
  expect(item.focus).toEqual({ x: 0.35, y: 0.25, w: 0.5, h: 0.5 });
  await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled();
});

test("a zoom typed into an unchanged crop editor is saved by a single click on Save", async ({ page, adminApi }) => {
  const { id } = await uploadRendered(adminApi, "framing-click.png", [40, 160, 90]);

  await page.goto("/admin/media");
  await page.getByRole("button", { name: /^framing-click\.png/ }).dblclick();
  const viewer = page.getByRole("dialog", { name: "framing-click.png" });
  await viewer.getByRole("button", { name: "Ausschnitt anpassen" }).click();
  const editor = page.getByRole("dialog", { name: "Ausschnitt: framing-click.png" });
  await editor.getByRole("tab", { name: "Feinschnitt" }).click();
  const save = editor.getByRole("button", { name: "Speichern" });
  await expect(save).toBeDisabled();

  const zoom = editor.locator('[data-test="crop-detail"]').getByRole("spinbutton", { name: "Zoom", exact: true });
  await zoom.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await zoom.pressSequentially("200");
  const saved = page.waitForResponse((response) => response.request().method() === "PUT" && new URL(response.url()).pathname === `/api/media/${id}/framing`);
  await save.click();
  expect((await saved).status()).toBe(200);
  await expect(editor).toBeHidden();
});

test("the crop editor shows a WebP tagged as turned upright, as kestrel cuts it", async ({ page, adminApi }) => {
  await page.goto("/admin/media");
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "rgb(30, 90, 200)";
      context.fillRect(0, 0, 800, 400);
      context.fillStyle = "rgb(240, 240, 240)";
      context.fillRect(0, 0, 200, 400);
    }
    return canvas.toDataURL("image/webp", 0.9);
  });
  const webp = withExifOrientation(Buffer.from(encoded.split(",")[1] ?? "", "base64"), 800, 400, 6);
  const id = idOf(await adminApi.upload("framing-turned.webp", webp));
  await until("the whole-image variants of framing-turned.webp", async () => {
    const item = await adminApi.call("GET", `/media/${id}`);
    const framing = isRecord(item.framing) ? item.framing : {};
    const variants = Array.isArray(item.variants) ? item.variants.filter(isRecord) : [];
    return framing.width === 400 && framing.height === 800 && variants.some((variant) => variant.size === "thumb" && variant.state === "done");
  });

  await page.reload();
  await page.getByRole("button", { name: /^framing-turned\.webp/ }).dblclick();
  await page.getByRole("dialog", { name: "framing-turned.webp" }).getByRole("button", { name: "Ausschnitt anpassen" }).click();
  const editor = page.getByRole("dialog", { name: "Ausschnitt: framing-turned.webp" });
  const image = editor.locator(".ui-rect-select__image");
  await expect(image).toHaveAttribute("src", /\/variants\//);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.naturalHeight / img.naturalWidth)).toBe(2);
});

test("a 3:2 image's srcset on a public page offers the uncut 3:2 cover variant with the whole-image widths, and leaves it out once that ratio is cut by hand", async ({ adminApi, visitor }) => {
  const id = idOf(await adminApi.upload("framing-srcset.png", gradientPng(1200, 800, [90, 40, 160], [240, 240, 240])));
  await until("the variants of framing-srcset.png", async () => {
    const paths = await renderedPaths(adminApi, id);
    return ["thumb", "small", "medium", "teaser"].every((size) => paths[size] !== undefined);
  });
  const alt = "Ein violetter Verlauf";
  await adminApi.call("POST", "/pages", { locale: "de", slug: "bildsrcset", title: "Bild-srcset", status: "published", body: [{ id: "s1", type: "image", props: { image: id, alt } }] });
  await expect.poll(async () => (await visitor.get("/bildsrcset")).status(), { timeout: 60_000 }).toBe(200);

  const before = await srcsetSizes(visitor, "/bildsrcset", alt);
  expect(before).toEqual(expect.arrayContaining(["thumb", "teaser", "small", "medium"]));
  expect(before).not.toContain("avatar");

  await adminApi.call("PUT", `/media/${id}/framing`, { crops: { "3:2": { x: 0, y: 0, w: 0.5, h: 0.5 } } });
  await until("the teaser variant to show the manual crop", async () => {
    const item = await adminApi.call("GET", `/media/${id}`);
    const teaser = (Array.isArray(item.variants) ? item.variants.filter(isRecord) : []).find((variant) => variant.size === "teaser");
    return teaser?.state === "done" && isRecord(teaser.crop) && teaser.crop.width === 600;
  });
  await expect.poll(() => srcsetSizes(visitor, "/bildsrcset", alt), { timeout: 60_000 }).not.toContain("teaser");
  expect(await srcsetSizes(visitor, "/bildsrcset", alt)).toEqual(expect.arrayContaining(["thumb", "small", "medium"]));
});

test("the crop editor shows an upside-down WebP, whose width and height survive its orientation, from its whole-image variant only", async ({ page, adminApi }) => {
  await page.goto("/admin/media");
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "rgb(30, 90, 200)";
      context.fillRect(0, 0, 800, 400);
      context.fillStyle = "rgb(240, 240, 240)";
      context.fillRect(0, 0, 200, 400);
    }
    return canvas.toDataURL("image/webp", 0.9);
  });
  const webp = withExifOrientation(Buffer.from(encoded.split(",")[1] ?? "", "base64"), 800, 400, 3);
  const id = idOf(await adminApi.upload("framing-upside-down.webp", webp));
  await until("the whole-image variants of framing-upside-down.webp", async () => {
    const item = await adminApi.call("GET", `/media/${id}`);
    const framing = isRecord(item.framing) ? item.framing : {};
    const variants = Array.isArray(item.variants) ? item.variants.filter(isRecord) : [];
    return framing.width === 800 && framing.height === 400 && variants.some((variant) => variant.size === "thumb" && variant.state === "done");
  });

  await page.reload();
  await page.getByRole("button", { name: /^framing-upside-down\.webp/ }).dblclick();
  await page.getByRole("dialog", { name: "framing-upside-down.webp" }).getByRole("button", { name: "Ausschnitt anpassen" }).click();
  const editor = page.getByRole("dialog", { name: "Ausschnitt: framing-upside-down.webp" });
  const image = editor.locator(".ui-rect-select__image");
  await expect(image).toHaveAttribute("src", /\/variants\//);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const light = await image.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(img, 0, 0);
    const brightness = (x: number) => {
      const [r = 0, g = 0, b = 0] = context.getImageData(Math.round(x * img.naturalWidth), Math.round(img.naturalHeight / 2), 1, 1).data;
      return (r + g + b) / 3;
    };
    return { left: brightness(0.05), right: brightness(0.95) };
  });
  expect(light?.right).toBeGreaterThan(200);
  expect(light?.left).toBeLessThan(160);
});
