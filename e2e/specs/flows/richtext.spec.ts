import { idOf } from "../../support/api.ts";
import { expect, test } from "../../support/fixtures.ts";

const body = '<div id="__NUXT_DATA__">[1]</div><h2 id="teleports">Abschnitt</h2><h2 id="anker">Anker</h2><p id="__nuxt">Text</p>';

test("rich text naming the page's own element ids keeps only its own anchors, and the page hydrates normally", async ({ adminApi, browser, baseURL, visitor }) => {
  const id = idOf(await adminApi.call("POST", "/pages", { locale: "de", slug: "kennungen", title: "Kennungen", status: "published", body: [{ id: "k1", type: "prose", props: { body } }] }));
  const stored = await adminApi.call("GET", `/admin/pages/${id}`);
  expect(JSON.stringify(stored)).not.toContain("__NUXT_DATA__");

  await expect.poll(async () => (await visitor.get("/kennungen")).status()).toBe(200);
  const html = await (await visitor.get("/kennungen")).text();
  expect(html.match(/id="__NUXT_DATA__"/g)).toHaveLength(1);
  expect(html.match(/id="teleports"/g)?.length ?? 0).toBeLessThanOrEqual(1);
  expect(html.match(/id="__nuxt"/g)).toHaveLength(1);
  expect(html).toContain('id="anker"');

  const anonymous = await browser.newContext({ baseURL });
  const visit = await anonymous.newPage();
  const errors: string[] = [];
  visit.on("pageerror", (error) => errors.push(error.message));
  visit.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await visit.goto("/kennungen");
  await expect(visit.getByRole("heading", { name: "Anker" })).toBeVisible();
  const state = await visit.evaluate(() => ({
    payload: Array.from(document.querySelectorAll("[id='__NUXT_DATA__']"), (element) => element.tagName),
    mounted: Reflect.get(document.getElementById("__nuxt") ?? {}, "__vue_app__") !== undefined,
    anchor: document.getElementById("anker")?.tagName ?? null,
  }));
  expect(state).toEqual({ payload: ["SCRIPT"], mounted: true, anchor: "H2" });
  expect(errors).toEqual([]);
  await anonymous.close();
});
