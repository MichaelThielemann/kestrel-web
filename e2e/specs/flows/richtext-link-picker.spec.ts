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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
