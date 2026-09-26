import { isRecord } from "../../support/api.ts";
import { save } from "../../support/editor.ts";
import { ADMIN_STATE } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.use({ storageState: ADMIN_STATE });

test("a collection mounted in the settings is reachable under its page and keeps the mount when another locale saves", async ({ page, seed, adminApi, visitor }) => {
  await page.goto("/admin/system?tab=settings");
  await page.getByRole("combobox", { name: "Blog" }).selectOption({ label: "Aktuelles (/aktuelles)" });
  await save(page);

  expect((await visitor.get("/aktuelles/hallo")).status()).toBe(200);
  const moved = await visitor.get("/projekte/hallo", { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(new URL(moved.headers().location ?? "", "http://127.0.0.1").pathname).toBe("/aktuelles/hallo");

  await page.getByRole("link", { name: "EN bearbeiten" }).click();
  const title = page.getByRole("textbox", { name: "Website-Titel" });
  await expect(title).toHaveValue("Kestrel Example");
  await title.fill("Kestrel Example Site");
  const english = await save(page);
  const sent: unknown = english.request().postDataJSON();
  expect(isRecord(sent) ? sent.locale : null).toBe("en");

  const settings = await adminApi.call("GET", "/settings?locale=en");
  expect(settings.title).toBe("Kestrel Example Site");
  expect(isRecord(settings.mounts) ? settings.mounts.blog : null).toBe(seed.news);
  expect((await visitor.get("/aktuelles/hallo")).status()).toBe(200);
});
