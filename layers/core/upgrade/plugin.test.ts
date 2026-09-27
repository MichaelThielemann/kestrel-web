import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createPersistenceSqlite } from "@michaelthielemann/kestrel-persistence-sqlite/impl";
import { silentLogger } from "@michaelthielemann/kestrel/logger";
import { PLUGIN_API } from "../../../scripts/kestrel-engine-range.mjs";
import { createLayerPlugin } from "./plugin";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "site-2.0");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the layer's upgrade plugin", () => {
  it("reports stored link targets outside the allowed schemes from the data command's hook", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kestrel-layer-plugin-"));
    dirs.push(dir);
    const db = createPersistenceSqlite({ file: join(dir, "kestrel.db") }, { logger: silentLogger });
    try {
      await db.ensureCollection("pages", { slug__en: "string", body__en: "json" });
      await db.createOne("pages", { id: "p1", slug__en: "home", body__en: [{ type: "hero", props: { cta: { type: "external", url: "javascript:alert(1)" } } }] });
      const plugin = createLayerPlugin();
      const findings = (await plugin.dataFindings?.(db, FIXTURE, undefined)) ?? [];
      expect(findings.map((f) => f.rule)).toEqual(["data/link-target"]);
      expect(findings[0]?.message).toContain("p1 (en)");
    } finally {
      db.close();
    }
  });

  it("declares plugin API 5, the first that runs its dataFindings hook", () => {
    expect(createLayerPlugin().dataFindings).toBeTypeOf("function");
    expect(PLUGIN_API).toBe(5);
  });
});
