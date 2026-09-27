import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersistenceSqlite } from "@michaelthielemann/kestrel-persistence-sqlite/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";
import { linkDataFindings } from "./linkData";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const model = {
  locales: ["de", "en"],
  defaultLocale: "de",
  types: {
    settings: { kind: "single", fields: { navigation: { type: "json", localized: true } } },
    pages: { kind: "multi", fields: { slug: { type: "slug", localized: true }, body: { type: "json", localized: true } } },
  },
};

async function seeded(rows: { pages?: Array<Record<string, unknown>>; settings?: Array<Record<string, unknown>> }) {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-link-data-"));
  dirs.push(dir);
  const db = createPersistenceSqlite({ file: join(dir, "kestrel.db") }, { logger: silentLogger });
  await db.ensureCollection("pages", { slug__de: "string", slug__en: "string", body__de: "json", body__en: "json" });
  await db.ensureCollection("settings", { navigation__de: "json", navigation__en: "json" });
  for (const row of rows.pages ?? []) await db.createOne("pages", row);
  for (const row of rows.settings ?? []) await db.createOne("settings", row);
  return db;
}

const hero = (cta: unknown) => [{ type: "hero", props: { heading: "Hi", cta }, slots: { default: [{ type: "teaser", props: { links: [{ link: cta }] } }] } }];

describe("stored link values the link target rule refuses", () => {
  it("reports every stored external link target that is not http(s), mailto, tel or site-relative, per collection and field", async () => {
    const db = await seeded({
      pages: [
        { id: "p1", slug__de: "a", body__de: hero({ type: "external", url: "javascript:alert(1)" }), body__en: hero({ type: "external", url: "https://example.com" }) },
        { id: "p2", slug__de: "b", body__de: hero({ type: "external", url: "/kontakt" }), body__en: hero({ type: "external", url: " DATA:text/html,x" }) },
      ],
      settings: [{ id: "s", navigation__de: [{ label: "x", link: { type: "external", url: "vbscript:x" } }] }],
    });
    try {
      const findings = await linkDataFindings(db, model);
      expect(findings.map((f) => [f.rule, f.severity, f.where.path])).toEqual([
        ["data/link-target", "error", "settings.navigation"],
        ["data/link-target", "error", "pages.body"],
      ]);
      expect(findings[1]?.message).toContain("4 stored link");
      expect(findings[1]?.message).toContain("p1 (de)");
      expect(findings[1]?.message).toContain("p2 (en)");
    } finally {
      db.close();
    }
  });

  it("reports nothing when every stored link target is allowed", async () => {
    const db = await seeded({
      pages: [{ id: "p1", slug__de: "a", body__de: hero({ type: "external", url: "mailto:a@example.com" }), body__en: hero({ type: "internal", collection: "pages", id: "p1" }) }],
    });
    try {
      expect(await linkDataFindings(db, model)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("reads nothing for a model it cannot read", async () => {
    const db = await seeded({});
    try {
      expect(await linkDataFindings(db, undefined)).toEqual([]);
    } finally {
      db.close();
    }
  });
});
