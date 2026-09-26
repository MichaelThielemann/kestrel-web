import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SITE_DIR } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

const exported = (path: string): string => join(SITE_DIR, path === "/" ? "" : path.slice(1), "index.html");

test("the static export holds a subpage and a mounted post as files, and no draft", () => {
  for (const path of ["/", "/ueber-uns", "/ueber-uns/team", "/projekte", "/projekte/hallo", "/en/about"]) {
    expect(existsSync(exported(path)), path).toBe(true);
    expect(readFileSync(exported(path), "utf8"), path).toContain('data-kestrel-delivery="static"');
  }
  expect(readFileSync(exported("/ueber-uns/team"), "utf8")).toContain("Das Team hinter der Seite.");
  expect(readFileSync(exported("/projekte/hallo"), "utf8")).toContain("Ein erster Beitrag.");
  expect(existsSync(exported("/entwurf"))).toBe(false);
});
