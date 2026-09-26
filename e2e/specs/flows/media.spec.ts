import { idOf, isRecord } from "../../support/api.ts";
import { save } from "../../support/editor.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";
import { gradientPng } from "../../support/png.ts";

test.use({ storageState: ADMIN_STATE });

test("an uploaded file is picked as a share image and then refuses deletion while referenced", async ({ page, seed, adminApi }) => {
  await page.goto("/admin/media");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Hochladen" }).click();
  await (await chooser).setFiles({ name: "teaser.png", mimeType: "image/png", buffer: gradientPng(800, 500, [200, 60, 60], [60, 60, 200]) });
  const uploaded = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/media");
  await page.getByRole("dialog", { name: "Dateien hochladen" }).getByRole("button", { name: "Hochladen" }).click();
  const upload = await uploaded;
  expect(upload.status()).toBeLessThan(300);
  const body: unknown = await upload.json();
  const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
  expect(id).not.toBe("");
  await expect(page.getByRole("button", { name: /teaser\.png/ })).toBeVisible({ timeout: 30_000 });

  await page.goto(`/admin/pages/${seed.news}?locale=de`);
  await page.getByRole("button", { name: "Share-Bild" }).click();
  const picker = page.getByRole("dialog", { name: "Datei auswählen" });
  await picker.getByRole("button", { name: /teaser\.png/ }).click();
  await picker.getByRole("button", { name: "Auswahl verwenden" }).click();
  await expect(picker).toBeHidden();
  const saved = await save(page);
  expect(saved.request().method()).toBe("PATCH");
  expect((await adminApi.call("GET", `/pages/${seed.news}?locale=de`)).shareImage).toBe(id);

  const refused = await adminApi.raw("DELETE", `/media/${id}`);
  expect(refused.status).toBe(409);
  expect(refused.text).toContain(seed.news);

  await page.goto("/admin/media");
  await page.getByRole("button", { name: /teaser\.png/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  const dialog = page.getByRole("dialog", { name: "Löschen" });
  await expect(dialog.getByText("Referenziert von 1 Dokument(en):")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Aktuelles" })).toBeVisible();
  const attempt = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === `/api/media/${id}`);
  await dialog.getByRole("button", { name: "Löschen" }).click();
  expect((await attempt).status()).toBe(409);
  await expect(dialog.getByText("Inzwischen referenziert von — nicht gelöscht:")).toBeVisible();
  expect((await adminApi.raw("GET", `/media/${id}`)).status).toBe(200);
});

test("a file used only by an image block inside a column refuses deletion and the dialog names the page", async ({ page, adminApi }) => {
  const id = idOf(await adminApi.upload("column.png", gradientPng(400, 300, [60, 160, 60], [20, 40, 120])));
  const created = await adminApi.call("POST", "/pages", {
    locale: "de",
    slug: "spalten-bild",
    title: "Spalten mit Bild",
    status: "draft",
    body: [{ id: "c1", type: "columns", props: {}, slots: { left: [{ id: "c2", type: "image", props: { image: id, alt: "Ein Verlauf" } }], right: [] } }],
  });
  const pageId = idOf(created);

  const refused = await adminApi.raw("DELETE", `/media/${id}`);
  expect(refused.status).toBe(409);
  expect(refused.text).toContain(`pages/${pageId}`);

  await page.goto("/admin/media");
  await page.getByRole("button", { name: /column\.png/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  const dialog = page.getByRole("dialog", { name: "Löschen" });
  await expect(dialog.getByText("Referenziert von 1 Dokument(en):")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Spalten mit Bild" })).toBeVisible();
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  expect((await adminApi.raw("GET", `/media/${id}`)).status).toBe(200);
});
