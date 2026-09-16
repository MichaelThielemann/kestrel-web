import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageInstalled } from "./installed";
import { renderOptionalModules } from "./index";

describe("packageInstalled", () => {
  it("finds a package in node_modules of the start directory or any ancestor", () => {
    const root = mkdtempSync(join(tmpdir(), "kestrel-optional-"));
    mkdirSync(join(root, "node_modules", "@scope", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "@scope", "pkg", "package.json"), "{}");
    const nested = join(root, "apps", "site");
    mkdirSync(nested, { recursive: true });
    expect(packageInstalled("@scope/pkg", [nested])).toBe(true);
    expect(packageInstalled("@scope/other", [nested])).toBe(false);
  });
});

describe("renderOptionalModules", () => {
  it("imports each present package and exports them keyed by name", () => {
    expect(renderOptionalModules(["@scope/a", "@scope/b"])).toBe(
      'import m0 from "@scope/a";\nimport m1 from "@scope/b";\n\nexport default {\n  "@scope/a": m0,\n  "@scope/b": m1,\n};\n',
    );
  });
});
