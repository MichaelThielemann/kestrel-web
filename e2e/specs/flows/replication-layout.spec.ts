import { isRecord } from "../../support/api.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE, viewport: { width: 375, height: 667 } });

const MIN_TABLE_HEIGHT = 150;

test("the restore point table stays usable on a small screen, also with the restore notices shown", async ({ page, adminApi }) => {
  for (let index = 0; index < 4; index += 1) await adminApi.call("POST", "/admin/replication/snapshot", {});

  await page.route("**/api/admin/replication/status", async (route) => {
    const answer = await route.fetch();
    const body: unknown = await answer.json();
    await route.fulfill({ response: answer, json: { ...(isRecord(body) ? body : {}), pendingRestore: "db.snap" } });
  });
  await page.route("**/api/admin/replication/restore", (route) => route.fulfill({ json: { generation: 3, at: Date.now(), file: "db.snap", restartRequired: true } }));

  await page.goto("/admin/system?tab=replication");
  const table = page.locator(".replication .u-scroll");
  await expect(page.getByRole("button", { name: "Zu diesem Punkt wiederherstellen" }).first()).toBeVisible();
  expect((await table.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TABLE_HEIGHT);

  await page.getByRole("button", { name: "Zu diesem Punkt wiederherstellen" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(page.locator(".replication .ui-alert--success")).toBeVisible();

  const section = page.locator(".replication");
  const overflow = await section.evaluate((el) => ({ scrollable: getComputedStyle(el).overflowY === "auto" || getComputedStyle(el).overflowY === "scroll", clipped: el.scrollHeight > el.clientHeight }));
  expect(overflow.clipped ? overflow.scrollable : true).toBe(true);
  await table.scrollIntoViewIfNeeded();
  expect((await table.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TABLE_HEIGHT);
});
