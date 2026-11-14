import { expect, test } from "../../support/fixtures.ts";

const PUBLIC_PATHS = ["/", "/en", "/ueber-uns", "/en/about", "/projekte", "/projekte/hallo"];

test("a public page answers a signed-in request with the same HTML as an anonymous one", async ({ visitor, adminApi }) => {
  const cookie = `__Host-kestrel_token=${adminApi.token ?? ""}`;
  expect(adminApi.token).not.toBeNull();
  for (const path of PUBLIC_PATHS) {
    const anonymous = await visitor.get(path);
    const signedIn = await visitor.get(path, { headers: { cookie } });
    const bearer = await visitor.get(path, { headers: { authorization: `Bearer ${adminApi.token ?? ""}` } });
    expect(anonymous.status(), path).toBe(200);
    expect(signedIn.status(), path).toBe(200);
    expect(await signedIn.text(), path).toBe(await anonymous.text());
    expect(await bearer.text(), path).toBe(await anonymous.text());
    expect(anonymous.headers()["set-cookie"], path).toBeUndefined();
    expect(anonymous.headers()["vary"], path).toBeUndefined();
  }
});

test("a draft stays out of the public site for a signed-in request", async ({ visitor, adminApi }) => {
  const signedIn = await visitor.get("/entwurf", { headers: { cookie: `__Host-kestrel_token=${adminApi.token ?? ""}` } });
  expect(signedIn.status()).toBe(404);
  expect(await signedIn.text()).not.toContain("Noch nicht fertig.");
});
