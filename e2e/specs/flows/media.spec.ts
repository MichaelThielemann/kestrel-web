import { idOf, isRecord } from "../../support/api.ts";
import { save } from "../../support/editor.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";
import { gradientPng } from "../../support/png.ts";

test.use({ storageState: ADMIN_STATE });

test("the type filter narrows the library to images or other files, and combines with the type a field fixes", async ({ page, adminApi }) => {
  const imagePng = await adminApi.upload("gradient.png", gradientPng(300, 200, [10, 120, 200], [200, 10, 90]));
  idOf(imagePng);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }), "sheet.pdf");
  await adminApi.call("POST", "/media", undefined, form);

  await page.goto("/admin/media");
  await expect(page.getByRole("button", { name: /gradient\.png/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /sheet\.pdf/ })).toBeVisible();

  await page.getByRole("button", { name: "Andere Dateien" }).click();
  await expect(page.getByRole("button", { name: /sheet\.pdf/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /gradient\.png/ })).toBeHidden();

  await page.getByRole("button", { name: "Bilder" }).click();
  await expect(page.getByRole("button", { name: /gradient\.png/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /sheet\.pdf/ })).toBeHidden();
});

test("the media picker reopens in the folder the user last browsed", async ({ page, adminApi }) => {
  await adminApi.call("POST", "/media/folders", { path: "kampagnen" });

  await page.goto("/admin/media");
  await page.getByRole("button", { name: "kampagnen" }).click();
  await expect(page).toHaveURL(/folder=kampagnen/);

  await page.goto("/admin/pages/new?locale=de");
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Ordnertest");
  await page.getByRole("button", { name: "Block hinzufügen" }).click();
  await page.getByRole("searchbox", { name: "Blöcke durchsuchen" }).fill("Bild");
  await page.getByRole("button", { name: "Bild hinzufügen" }).click();
  await page.getByRole("region", { name: "Block-Felder" }).getByRole("button", { name: "Bild" }).click();
  const picker = page.getByRole("dialog", { name: "Datei auswählen" });
  await expect(picker.getByText("kampagnen")).toBeVisible();
});

test("an uploaded file in use goes to the trash only after a warning, stays there when deleted for good, and comes back on restore", async ({ page, seed, adminApi }) => {
  await page.goto("/admin/media");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Hochladen" }).click();
  await (await chooser).setFiles({ name: "teaser.png", mimeType: "image/png", buffer: gradientPng(800, 500, [200, 60, 60], [60, 60, 200]) });
  const uploaded = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/media");
  await page.getByRole("dialog", { name: "Dateien hochladen" }).getByRole("button", { name: "1 Datei hochladen" }).click();
  const upload = await uploaded;
  expect(upload.status()).toBeLessThan(300);
  const body: unknown = await upload.json();
  const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
  expect(id).not.toBe("");
  await expect(page.getByRole("button", { name: /^teaser\.png/ })).toBeVisible({ timeout: 30_000 });

  await page.goto(`/admin/pages/${seed.news}?locale=de`);
  await page.getByRole("button", { name: "Share-Bild" }).click();
  const picker = page.getByRole("dialog", { name: "Datei auswählen" });
  await picker.getByRole("button", { name: /^teaser\.png/ }).click();
  await picker.getByRole("button", { name: "Auswahl verwenden" }).click();
  await expect(picker).toBeHidden();
  const saved = await save(page);
  expect(saved.request().method()).toBe("PATCH");
  expect((await adminApi.call("GET", `/pages/${seed.news}?locale=de`)).shareImage).toBe(id);

  await page.goto("/admin/media");
  await page.getByRole("button", { name: /^teaser\.png/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "In den Papierkorb" }).click();
  const warning = page.getByRole("dialog", { name: "1 Datei in den Papierkorb verschieben?" });
  await expect(warning.getByText("Wird noch verwendet:")).toBeVisible();
  await expect(warning.getByRole("link", { name: "Aktuelles" })).toBeVisible();
  await expect(warning.getByRole("button", { name: "Abbrechen" })).toBeFocused();
  const trashed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/media/trash");
  await warning.getByRole("button", { name: "1 Datei in den Papierkorb" }).click();
  expect((await trashed).status()).toBe(200);
  await expect(page.getByRole("button", { name: /^teaser\.png/ })).toBeHidden();
  expect((await adminApi.raw("GET", `/media/${id}`)).status).toBe(404);
  expect((await adminApi.raw("DELETE", `/media/${id}`)).status).toBe(409);

  await page.getByRole("link", { name: /^Papierkorb \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/trash=1/);
  await page.getByRole("checkbox", { name: "teaser.png auswählen" }).check();
  await page.getByRole("toolbar").getByRole("button", { name: "Endgültig löschen" }).click();
  const purge = page.getByRole("dialog", { name: "1 Datei endgültig löschen?" });
  await purge.getByRole("button", { name: "1 Datei endgültig löschen" }).click();
  const report = page.getByRole("dialog", { name: "Nicht alles wurde entfernt" });
  await expect(report.getByText("Wird noch von einer Seite verwendet")).toBeVisible();
  await report.getByRole("button", { name: "Schließen" }).last().click();

  await page.getByRole("button", { name: "teaser.png wiederherstellen" }).click();
  await expect(page.getByRole("checkbox", { name: "teaser.png auswählen" })).toBeHidden();
  expect((await adminApi.raw("GET", `/media/${id}`)).status).toBe(200);
});

test("a file used only by an image block inside a column warns before the trash and the dialog names the page", async ({ page, adminApi }) => {
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
  await page.getByRole("button", { name: /^column\.png/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "In den Papierkorb" }).click();
  const dialog = page.getByRole("dialog", { name: "1 Datei in den Papierkorb verschieben?" });
  await expect(dialog.getByText("Wird noch verwendet:")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Spalten mit Bild" })).toBeVisible();
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  expect((await adminApi.raw("GET", `/media/${id}`)).status).toBe(200);
});

test("several unused files go to the trash at once without a dialog and come back with undo", async ({ page, adminApi }) => {
  const first = idOf(await adminApi.upload("erstes.png", gradientPng(120, 80, [20, 20, 200], [200, 200, 20])));
  const second = idOf(await adminApi.upload("zweites.png", gradientPng(120, 80, [200, 20, 20], [20, 200, 200])));

  await page.goto("/admin/media");
  await page.getByRole("checkbox", { name: "erstes.png auswählen" }).check();
  await page.getByRole("checkbox", { name: "zweites.png auswählen" }).check();
  const bar = page.getByRole("toolbar", { name: "2 Elemente ausgewählt" });
  await expect(bar).toBeVisible();
  const trashed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/media/trash");
  await bar.getByRole("button", { name: "In den Papierkorb" }).click();
  expect((await trashed).status()).toBe(200);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: /^erstes\.png/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /^zweites\.png/ })).toBeHidden();

  const toast = page.getByRole("region", { name: "Benachrichtigungen" }).getByText("2 Elemente in den Papierkorb verschoben");
  await expect(toast).toBeVisible();
  await page.getByRole("region", { name: "Benachrichtigungen" }).getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("button", { name: /^erstes\.png/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^zweites\.png/ })).toBeVisible();
  expect((await adminApi.raw("GET", `/media/${first}`)).status).toBe(200);
  expect((await adminApi.raw("GET", `/media/${second}`)).status).toBe(200);
});
