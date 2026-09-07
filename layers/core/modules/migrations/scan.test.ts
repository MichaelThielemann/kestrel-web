import { describe, expect, it } from "vitest";
import { listMigrationFiles, renderMigrationsModule } from "./scan";

describe("listMigrationFiles", () => {
  it("lists .ts files sorted by filename", () => {
    const list = () => ["2026-09-02-b.ts", "2026-09-01-a.ts", "readme.md"];
    expect(listMigrationFiles("/root/migrations", list)).toEqual([
      "/root/migrations/2026-09-01-a.ts",
      "/root/migrations/2026-09-02-b.ts",
    ]);
  });

  it("returns an empty array when the directory does not exist", () => {
    const list = () => {
      throw Object.assign(new Error("nope"), { code: "ENOENT" });
    };
    expect(listMigrationFiles("/root/migrations", list)).toEqual([]);
  });

  it("re-throws any other error", () => {
    const list = () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    };
    expect(() => listMigrationFiles("/root/migrations", list)).toThrow("denied");
  });
});

describe("renderMigrationsModule", () => {
  it("imports each path in order and exports migrations sorted by input order", () => {
    const code = renderMigrationsModule(["/root/migrations/a.ts", "/root/migrations/b.ts"]);
    expect(code).toBe(
      [
        'import _0 from "/root/migrations/a.ts";',
        'import _1 from "/root/migrations/b.ts";',
        "",
        "export const migrations = [",
        "  _0,",
        "  _1,",
        "];",
        "",
      ].join("\n"),
    );
  });

  it("exports an empty array for no paths", () => {
    expect(renderMigrationsModule([])).toBe(["", "export const migrations = [", "];", ""].join("\n"));
  });
});
