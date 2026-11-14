import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

test("the internal link picker keeps the chosen record readable next to its status badge at the narrowest reflow width", async ({ page, seed }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/admin/pages/${seed.about}?locale=de`);
  await page.getByRole("button", { name: "Fließtext" }).click();
  await page.getByRole("button", { name: "Interner Link" }).click();
  await page.getByRole("combobox", { name: "Collection" }).selectOption({ label: "Seiten" });
  await page.getByRole("combobox", { name: "Einträge suchen…" }).click();
  await page.getByRole("option", { name: /Unveröffentlichter Entwurf/ }).click();

  const input = page.getByRole("combobox", { name: "Einträge suchen…" });
  await expect(input).toHaveValue("Unveröffentlichter Entwurf");
  const width = await input.evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(56);
  const anchor = page.locator(".ui-link-internal .ui-combobox__anchor");
  const fit = await anchor.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const toggle = element.querySelector("button:last-of-type")?.getBoundingClientRect();
    const hint = element.querySelector(".ui-combobox__hint");
    return {
      contained: element.scrollWidth <= element.clientWidth,
      toggleInside: toggle !== undefined && toggle.left >= box.left && toggle.right <= box.right,
      hintComplete: hint !== null && hint.scrollWidth <= hint.clientWidth,
    };
  });
  expect(fit).toEqual({ contained: true, toggleInside: true, hintComplete: true });
  const toggleBox = await page.getByRole("button", { name: "Optionen ein-/ausblenden" }).boundingBox();
  const applyBox = await page.getByRole("button", { name: "Übernehmen" }).boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(applyBox).not.toBeNull();
  if (toggleBox !== null && applyBox !== null) {
    const separate = toggleBox.x + toggleBox.width <= applyBox.x || applyBox.x + applyBox.width <= toggleBox.x || toggleBox.y + toggleBox.height <= applyBox.y || applyBox.y + applyBox.height <= toggleBox.y;
    expect(separate).toBe(true);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the external link popover keeps the apply button beside the URL field on a wide viewport and overflow-free at the narrowest width", async ({ page, seed }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/pages/${seed.about}?locale=de`);
  await page.getByRole("button", { name: "Fließtext" }).click();
  await page.getByRole("button", { name: "Link", exact: true }).click();

  const field = page.getByRole("textbox", { name: "Link-URL" });
  const apply = page.getByRole("button", { name: "Übernehmen" });
  await expect(field).toBeVisible();
  const fieldBox = await field.boundingBox();
  const applyBox = await apply.boundingBox();
  expect(fieldBox).not.toBeNull();
  expect(applyBox).not.toBeNull();
  if (fieldBox !== null && applyBox !== null) {
    expect(applyBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width);
    expect(applyBox.y).toBeLessThan(fieldBox.y + fieldBox.height);
  }

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(field).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
