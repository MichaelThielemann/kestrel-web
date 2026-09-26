import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";
import { gradientPng } from "../../support/png.ts";

test.use({ storageState: ADMIN_STATE });

test("an uploaded file is picked as a share image and then refuses deletion while referenced", async ({ page, seed, adminApi }) => {
  await page.goto("/admin/media");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Hochladen" }).click();
  await (await chooser).setFiles({ name: "teaser.png", mimeType: "image/png", buffer: gradientPng(800, 500, [200, 60, 60], [60, 60, 200]) });
  await page.getByRole("dialog", { name: "Dateien hochladen" }).getByRole("button", { name: "Hochladen" }).click();
  const tile = page.getByRole("button", { name: /teaser\.png/ });
  await expect(tile).toBeVisible({ timeout: 30_000 });

  await page.goto(`/admin/pages/${seed.news}?locale=de`);
  await page.getByRole("button", { name: "Share-Bild" }).click();
  const picker = page.getByRole("dialog", { name: "Datei auswählen" });
  await picker.getByRole("button", { name: /teaser\.png/ }).click();
  await picker.getByRole("button", { name: "Auswahl verwenden" }).click();
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Keine Änderungen zu speichern")).toBeVisible();

  const listing = await adminApi.call("GET", "/media?q=teaser");
  const items = Array.isArray(listing.items) ? listing.items : [];
  const teaser = items.find((item: unknown) => typeof item === "object" && item !== null && "filename" in item && item.filename === "teaser.png");
  const id = typeof teaser === "object" && teaser !== null && "id" in teaser ? String(teaser.id) : "";
  expect(id).not.toBe("");
  const refused = await adminApi.raw("DELETE", `/media/${id}`);
  expect(refused.status).toBe(409);
  expect(refused.text).toContain(seed.news);

  await page.goto("/admin/media");
  await page.getByRole("button", { name: /teaser\.png/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  const dialog = page.getByRole("dialog", { name: "Löschen" });
  await expect(dialog.getByText("Referenziert von 1 Dokument(en):")).toBeVisible();
  await expect(dialog.getByText("Aktuelles")).toBeVisible();
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(dialog.getByText("Inzwischen referenziert von — nicht gelöscht:")).toBeVisible();
  expect((await adminApi.raw("GET", `/media/${id}`)).status).toBe(200);
});
