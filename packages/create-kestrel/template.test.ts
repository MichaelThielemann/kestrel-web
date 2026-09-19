import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { featureOrder } from "#kestrel/pipelines";
import { expectedVersions, serialize } from "../../scripts/create-kestrel-versions.mjs";
import { ALL_FEATURES, DEFAULT_FEATURES } from "./src/features.mjs";
import { renderTemplate } from "./src/render.mjs";
import { occupants, projectFiles, readVersions, targetName, writeProject } from "./src/scaffold.mjs";

const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const TEMPLATE_DIR = fileURLToPath(new URL("./template", import.meta.url));
const ROOT_MANIFEST = fileURLToPath(new URL("../../package.json", import.meta.url));
const VERSIONS = readVersions(PACKAGE_ROOT);

const BASE = {
  name: "my-site",
  packageManager: "pnpm",
  defaultLocale: "en",
  locales: ["en"],
  features: [...DEFAULT_FEATURES],
  blobstore: "filesystem",
  adminUser: "admin",
  password: "longenough",
};

function files(overrides: Partial<typeof BASE>) {
  return projectFiles({ ...BASE, ...overrides }, VERSIONS, TEMPLATE_DIR);
}

function text(map: Map<string, string>, path: string) {
  const content = map.get(path);
  if (content === undefined) throw new Error(`the scaffold has no ${path}`);
  return content;
}

describe("the feature list", () => {
  it("is exactly what the preset knows", () => {
    expect(ALL_FEATURES).toEqual([...featureOrder]);
  });

  it("preselects the default feature set", () => {
    expect(DEFAULT_FEATURES).toEqual(["references", "links", "delivery", "redirects", "images", "insights", "revisions"]);
  });
});

describe("versions.json", () => {
  it("pins what this repository itself uses", () => {
    const manifest = JSON.parse(readFileSync(ROOT_MANIFEST, "utf8"));
    expect(serialize(VERSIONS)).toBe(serialize(expectedVersions(manifest)));
  });
});

describe("renderTemplate", () => {
  it("substitutes a value and drops a line whose placeholder is null", () => {
    expect(renderTemplate("a=__ONE__\nb=__TWO__\nc", { ONE: "1", TWO: null })).toBe("a=1\nc");
  });

  it("refuses a placeholder the caller does not know", () => {
    expect(() => renderTemplate("__MYSTERY__", {})).toThrow(/unknown placeholder __MYSTERY__/);
  });
});

describe("targetName", () => {
  it("turns a leading underscore into a leading dot", () => {
    expect(targetName("_gitignore")).toBe(".gitignore");
    expect(targetName("shared/model.ts")).toBe("shared/model.ts");
  });
});

describe("projectFiles", () => {
  it("writes the whole starter", () => {
    expect([...files({}).keys()].sort()).toEqual([
      ".env",
      ".env.example",
      ".gitignore",
      "README.md",
      "app/blocks/Hero.vue",
      "app/blocks/Prose.vue",
      "kestrel.config.ts",
      "nuxt.config.ts",
      "package.json",
      "pnpm-workspace.yaml",
      "shared/collections-ui.ts",
      "shared/model.ts",
      "tsconfig.json",
    ]);
  });

  it("leaves no placeholder behind in any combination", () => {
    for (const overrides of [
      {},
      { features: [], locales: ["de"], defaultLocale: "de", blobstore: "s3" },
      { features: [...ALL_FEATURES], locales: ["de", "en", "fr"], defaultLocale: "de" },
      { features: ["migrations"], packageManager: "npm" },
    ]) {
      for (const [path, content] of files(overrides)) {
        expect(`${path}: ${content}`).not.toMatch(/__[A-Z0-9_]+__/);
      }
    }
  });

  it("pins the layer and the engine to what this repository uses", () => {
    const manifest = JSON.parse(text(files({}), "package.json"));
    expect(manifest.dependencies["@michaelthielemann/kestrel-web"]).toBe(VERSIONS.kestrelWeb);
    expect(manifest.dependencies["@michaelthielemann/kestrel"]).toBe(VERSIONS.kestrel);
    expect(manifest.name).toBe("my-site");
  });

  it("adds the three insights packages only with the insights feature", () => {
    const withInsights = JSON.parse(text(files({}), "package.json")).dependencies;
    expect(Object.keys(withInsights)).toContain("@michaelthielemann/kestrel-insights");
    expect(Object.keys(withInsights)).toContain("@vue-flow/core");
    expect(Object.keys(withInsights)).toContain("@dagrejs/dagre");

    const without = JSON.parse(text(files({ features: ["references"] }), "package.json")).dependencies;
    expect(Object.keys(without)).not.toContain("@michaelthielemann/kestrel-insights");
    expect(Object.keys(without)).not.toContain("@vue-flow/core");
    expect(Object.keys(without)).not.toContain("@dagrejs/dagre");
  });

  it("puts the chosen locales and features into the model", () => {
    const model = text(files({ defaultLocale: "de", locales: ["de", "en"], features: ["images", "audit"] }), "shared/model.ts");
    expect(model).toContain('export const locales = ["de", "en"] as const;');
    expect(model).toContain('export const defaultLocale = "de";');
    expect(model).toContain('export const features = ["images", "audit"] as const satisfies readonly Feature[];');
  });

  it("orders the locales with the default one first", () => {
    const model = text(files({ defaultLocale: "en", locales: ["de", "en", "fr"] }), "shared/model.ts");
    expect(model).toContain('export const locales = ["en", "de", "fr"] as const;');
  });

  it("keeps the redirects collection only with the redirects feature", () => {
    expect(text(files({}), "shared/model.ts")).toContain('redirects: { kind: "single", fields: { rules: { type: "json" } } },');
    expect(text(files({ features: ["images"] }), "shared/model.ts")).not.toContain("redirects:");
  });

  it("passes a migrations option only with the migrations feature", () => {
    expect(text(files({ features: ["migrations"] }), "kestrel.config.ts")).toContain("migrations: { migrations: [] },");
    expect(text(files({}), "kestrel.config.ts")).not.toContain("migrations:");
  });

  it("names the bootstrap admin and reads its hash from the environment", () => {
    const config = text(files({ adminUser: "ops" }), "kestrel.config.ts");
    expect(config).toContain('bootstrap: { username: "ops", passwordHash: adminPasswordHash() },');
    expect(config).toContain("blobstore: envBlobstore(dataDir),");
  });

  it("writes the scrypt hash to .env and never the password itself", () => {
    const map = files({ password: "s3cret-passphrase", blobstore: "s3" });
    expect(text(map, ".env")).toMatch(/^KESTREL_ADMIN_PASSWORD_HASH=scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/m);
    for (const [path, content] of map) {
      expect(`${path}: ${content}`).not.toContain("s3cret-passphrase");
    }
  });

  it("writes S3 placeholders but no credentials, and only for the s3 blobstore", () => {
    const s3 = text(files({ blobstore: "s3" }), ".env.example");
    expect(s3).toContain("KESTREL_BLOBSTORE=s3");
    expect(s3).toContain("KESTREL_S3_BUCKET=your-bucket");
    expect(s3).toContain("KESTREL_S3_ACCESS_KEY_ID=\n");
    expect(s3).toContain("KESTREL_S3_SECRET_ACCESS_KEY=\n");

    const filesystem = text(files({}), ".env.example");
    expect(filesystem).toContain("KESTREL_BLOBSTORE=filesystem");
    expect(filesystem).not.toContain("KESTREL_S3_");
  });

  it("leaves the password hash out of .env.example", () => {
    expect(text(files({}), ".env.example")).toContain("KESTREL_ADMIN_PASSWORD_HASH=\n");
    expect(text(files({}), ".env.example")).not.toContain("scrypt$");
  });

  it("writes the commands of the chosen package manager into the README", () => {
    expect(text(files({ packageManager: "npm" }), "README.md")).toContain("npm run dev");
    expect(text(files({ packageManager: "yarn" }), "README.md")).toContain("yarn dev");
    expect(text(files({}), "README.md")).toContain("pnpm install");
  });
});

describe("occupants", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  function temporaryDirectory() {
    const root = mkdtempSync(join(tmpdir(), "kestrel-create-unit-"));
    roots.push(root);
    return root;
  }

  it("is empty for a missing or empty directory and for one that only holds a git repository", () => {
    const root = temporaryDirectory();
    expect(occupants(join(root, "absent"))).toEqual([]);
    expect(occupants(root)).toEqual([]);
    mkdirSync(join(root, ".git"));
    expect(occupants(root)).toEqual([]);
  });

  it("names what stands in the way", () => {
    const root = temporaryDirectory();
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, ".env"), "");
    expect(occupants(root).sort()).toEqual([".env", "package.json"]);
  });

  it("sees every file writeProject wrote", () => {
    const root = temporaryDirectory();
    const target = join(root, "site");
    writeProject(target, files({}));
    expect(occupants(target)).toContain("kestrel.config.ts");
    expect(readFileSync(join(target, "shared/model.ts"), "utf8")).toContain("export const features =");
  });
});
