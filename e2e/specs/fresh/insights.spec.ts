import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_STATE, REPO_ROOT } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

const bootstrapHash = /passwordHash:\s*"([^"]+)"/.exec(readFileSync(join(REPO_ROOT, "playground", "kestrel.config.ts"), "utf8"))?.[1] ?? "";
const hashDigest = bootstrapHash.split("$").at(-1) ?? "";

test.use({ storageState: ADMIN_STATE });

test("insights shows no secret in the page or in any answer, and marks preset values as preset defaults", async ({ page }) => {
  expect(hashDigest.length).toBeGreaterThan(32);
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/")) bodies.push(response.text().catch(() => ""));
  });

  await page.goto("/admin/insights?tab=config");
  const row = page.getByRole("row", { name: /^bootstrap\.passwordHash\b/ });
  await expect(row).toBeVisible();
  await expect.soft(row.getByRole("cell", { name: "geschwärzt" })).toHaveCount(2);
  await expect.soft(row.getByRole("cell", { name: "Standard · Preset" })).toBeVisible();
  await expect.soft(page.getByRole("row", { name: /^retentionDays integer optional 365 365 Standard · Preset$/ })).toBeVisible();

  await page.goto("/admin/insights/modules/authn/multi");
  await page.waitForLoadState("networkidle");

  const answers = await Promise.all(bodies);
  expect(answers.length).toBeGreaterThan(0);
  expect(answers.filter((answer) => answer.includes(hashDigest))).toEqual([]);
  expect(await page.content()).not.toContain(hashDigest);
});
