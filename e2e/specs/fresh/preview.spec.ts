import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

test("the editor preview renders the page with the site stylesheet", async ({ page, seed }) => {
  await page.goto(`/admin/pages/${seed.about}?locale=de`);
  const preview = page.getByRole("region", { name: "Live-Vorschau" }).locator("iframe").contentFrame();
  const site = preview.locator(".site").first();
  await expect(site).toBeVisible();
  await expect(preview.getByText("Wir bauen Seiten.")).toBeVisible();
  await expect(site).toHaveCSS("display", "flex");
  await expect(site).toHaveCSS("flex-direction", "column");
  await expect(site).toHaveCSS("font-family", /system-ui/);
});
