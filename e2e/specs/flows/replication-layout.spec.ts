import { isRecord } from "../../support/api.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

const MIN_TABLE_HEIGHT = 150;
const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test(`the replication tab stays usable at ${viewport.width} px, also with the restore notices shown`, async ({ page, adminApi }) => {
    await page.setViewportSize(viewport);
    for (let index = 0; index < 4; index += 1) await adminApi.call("POST", "/admin/replication/snapshot", {});

    await page.route("**/api/admin/replication/status", async (route) => {
      const answer = await route.fetch();
      const body: unknown = await answer.json();
      await route.fulfill({ response: answer, json: { ...(isRecord(body) ? body : {}), pendingRestore: "db.snap" } });
    });
    await page.route("**/api/admin/replication/restore", (route) => route.fulfill({ json: { generation: 3, at: Date.now(), file: "db.snap", restartRequired: true } }));

    await page.goto("/admin/system?tab=replication");
    const section = page.locator(".replication");
    const table = page.locator(".replication .u-scroll");
    await expect(page.getByRole("button", { name: "Zu diesem Punkt wiederherstellen" }).first()).toBeVisible();
    expect((await table.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TABLE_HEIGHT);

    const horizontal = () => section.evaluate((el) => ({ overflowX: getComputedStyle(el).overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    const before = await horizontal();
    expect(before.scrollWidth).toBeLessThanOrEqual(before.clientWidth);
    expect(before.overflowX).toBe("hidden");

    await page.getByRole("button", { name: "Zu diesem Punkt wiederherstellen" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Wiederherstellen" }).click();
    const success = page.locator(".replication .ui-alert--success");
    await expect(success).toBeVisible();
    await expect(success).toBeInViewport({ ratio: 1 });

    const vertical = await section.evaluate((el) => ({ scrollable: getComputedStyle(el).overflowY === "auto" || getComputedStyle(el).overflowY === "scroll", clipped: el.scrollHeight > el.clientHeight }));
    expect(vertical.clipped ? vertical.scrollable : true).toBe(true);
    const after = await horizontal();
    expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);

    await table.scrollIntoViewIfNeeded();
    expect((await table.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TABLE_HEIGHT);
  });
}
