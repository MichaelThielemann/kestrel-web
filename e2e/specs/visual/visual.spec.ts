import type { Page } from "@playwright/test";
import { ADMIN_STATE, VISUAL_IMAGE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

test.skip(process.env.KESTREL_E2E_VISUAL !== "1", `screenshots are compared only inside ${VISUAL_IMAGE}; run pnpm test:e2e:visual`);
test.use({ storageState: ADMIN_STATE, colorScheme: "light" });

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the page list looks as recorded", async ({ page }) => {
      await page.goto("/admin/pages");
      await expect(page.getByRole("row", { name: /^Über uns/ })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`pages-${viewport.name}.png`);
    });

    test("the page editor looks as recorded", async ({ page, seed }) => {
      await page.goto(`/admin/pages/${seed.about}?locale=de`);
      await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue("Über uns");
      await settle(page);
      await expect(page).toHaveScreenshot(`editor-${viewport.name}.png`, { mask: [page.locator("iframe"), page.getByText(/^127\.0\.0\.1:\d+\//)] });
    });

    test("the media library looks as recorded", async ({ page }) => {
      await page.goto("/admin/media");
      await expect(page.getByRole("button", { name: /landscape\.png/ })).toBeVisible();
      await settle(page);
      await expect(page).toHaveScreenshot(`media-${viewport.name}.png`);
    });
  });
}
