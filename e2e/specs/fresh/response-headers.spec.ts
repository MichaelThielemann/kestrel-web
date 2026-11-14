import { expect, test } from "../../support/fixtures.ts";

const ADMIN_HEADERS = {
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

for (const path of ["/admin", "/admin/", "/admin/login", "/admin/pages"]) {
  test(`${path} answers with the framing, referrer, sniffing and permissions headers`, async ({ visitor }) => {
    const response = await visitor.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject(ADMIN_HEADERS);
    expect(response.headers()["content-security-policy"]).toBeUndefined();
  });
}

for (const path of ["/", "/en", "/_preview/anything"]) {
  test(`${path} does not carry the admin headers`, async ({ visitor }) => {
    const response = await visitor.get(path);
    for (const name of Object.keys(ADMIN_HEADERS)) expect(response.headers()[name], name).toBeUndefined();
  });
}
