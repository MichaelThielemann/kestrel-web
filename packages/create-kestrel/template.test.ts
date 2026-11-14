import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { featureOrder } from "#kestrel/pipelines";
import { expectedVersions, serialize } from "../../scripts/create-kestrel-versions.mjs";
import { ALL_FEATURES, DEFAULT_FEATURES, normalizeFeatures } from "./src/features.mjs";
import { renderTemplate } from "./src/render.mjs";
import { occupants, projectFiles, readVersions, targetName, writeProject } from "./src/scaffold.mjs";

const PACKAGE_ROOT = fileURLToPath(new URL(".", import.meta.url));
const TEMPLATE_DIR = fileURLToPath(new URL("./template", import.meta.url));
const ROOT_MANIFEST = fileURLToPath(new URL("../../package.json", import.meta.url));
const ROOT_WORKSPACE = fileURLToPath(new URL("../../pnpm-workspace.yaml", import.meta.url));
const VERSIONS = readVersions(PACKAGE_ROOT);

const BASE = {
  name: "my-site",
  packageManager: "pnpm",
  defaultLocale: "en",
  locales: ["en"],
  features: [...DEFAULT_FEATURES],
  blobstore: "filesystem",
  adminUser: "admin",
  password: "long-enough-phrase",
};

function files(overrides: Partial<typeof BASE>) {
  return projectFiles({ ...BASE, ...overrides }, VERSIONS, TEMPLATE_DIR);
}

function yamlBlock(source: string, key: string) {
  const lines = source.split("\n");
  const start = lines.indexOf(`${key}:`);
  if (start === -1) return [];
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    block.push(line);
  }
  return block;
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
    expect(DEFAULT_FEATURES).toEqual(["ratelimit", "sanitizeSvg", "references", "links", "delivery", "redirects", "images", "audit", "insights", "eventsQueue", "revisions"]);
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

  it("carries this repository's overrides of third-party packages and its audit exceptions into pnpm-workspace.yaml", () => {
    const root = readFileSync(ROOT_WORKSPACE, "utf8");
    const scaffolded = text(files({}), "pnpm-workspace.yaml");
    const thirdParty = yamlBlock(root, "overrides").filter((line) => !line.trimStart().startsWith("'@michaelthielemann/"));
    expect(thirdParty).not.toEqual([]);
    expect(yamlBlock(scaffolded, "overrides")).toEqual(thirdParty);
    expect(yamlBlock(scaffolded, "auditConfig")).toEqual(yamlBlock(root, "auditConfig"));
    expect(yamlBlock(scaffolded, "allowBuilds")).toEqual(yamlBlock(root, "allowBuilds"));
  });

  it("adds the kestrel CLI as a dev dependency with a check script, on the Node version the CLI needs", () => {
    const manifest = JSON.parse(text(files({}), "package.json"));
    expect(manifest.devDependencies["@michaelthielemann/kestrel-cli"]).toBe(VERSIONS.kestrelCli);
    expect(VERSIONS.kestrelCli).toBe(VERSIONS.kestrel);
    expect(manifest.dependencies["@michaelthielemann/kestrel-cli"]).toBeUndefined();
    expect(manifest.scripts.check).toBe("kestrel check");
    expect(manifest.engines.node).toBe(">=22.18.0");
    expect(text(files({ packageManager: "npm" }), "README.md")).toContain("npm run check");
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

  it("keeps audit entries for 90 days with the audit feature", () => {
    expect(text(files({ features: ["audit"] }), "kestrel.config.ts")).toContain("audit: { retentionDays: 90 },");
    expect(text(files({ features: ["images"] }), "kestrel.config.ts")).not.toContain("audit:");
  });

  it("brings the rate limits along with the second factor", () => {
    expect(normalizeFeatures(["mfa"]).features).toContain("ratelimit");
  });

  it("offers the second factor as a feature that is not preselected", () => {
    expect(ALL_FEATURES).toContain("mfa");
    expect(DEFAULT_FEATURES).not.toContain("mfa");
  });

  it("with the mfa feature, writes a fresh second-factor key to .env, which the preset reads", () => {
    const withMfa = files({ features: ["mfa"] });
    const env = text(withMfa, ".env");
    expect(env).toMatch(/^KESTREL_MFA_KEY=[0-9a-f]{64}$/m);
    expect(text(files({ features: ["mfa"] }), ".env")).not.toBe(env);
    expect(text(withMfa, ".env.example")).toContain("KESTREL_MFA_KEY=\n");
    const without = files({});
    expect(text(without, ".env")).not.toContain("KESTREL_MFA_KEY");
    expect(text(without, ".env.example")).not.toContain("KESTREL_MFA_KEY");
  });

  it("with the rate limits, writes a fresh device-cookie key to .env, which the preset reads", () => {
    const withLimits = files({ features: ["ratelimit"] });
    const env = text(withLimits, ".env");
    expect(env).toMatch(/^KESTREL_DEVICE_KEY=[0-9a-f]{64}$/m);
    expect(text(files({ features: ["ratelimit"] }), ".env")).not.toBe(env);
    expect(text(withLimits, ".env.example")).toContain("KESTREL_DEVICE_KEY=\n");
    const without = files({ features: ["sanitizeSvg"] });
    expect(text(without, ".env")).not.toContain("KESTREL_DEVICE_KEY");
    expect(text(without, ".env.example")).not.toContain("KESTREL_DEVICE_KEY");
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

  it("reads the robots.txt policy from KESTREL_ROBOTS_POLICY, which .env.example lists and .env leaves unset", () => {
    const map = files({});
    expect(text(map, "kestrel.config.ts")).toContain("robots: envRobots(),");
    expect(text(map, "kestrel.config.ts")).toContain('import { adminPasswordHash, envBlobstore, envRobots, kestrelDataDir } from "#kestrel/config";');
    expect(text(map, ".env.example")).toContain("KESTREL_ROBOTS_POLICY=\n");
    expect(text(map, ".env")).not.toContain("KESTREL_ROBOTS_POLICY");
  });

  it("leaves the password hash out of .env.example", () => {
    expect(text(files({}), ".env.example")).toContain("KESTREL_ADMIN_PASSWORD_HASH=\n");
    expect(text(files({}), ".env.example")).not.toContain("scrypt$");
  });

  it("names only the installed kestrel command in the README, never an unscoped npx that could fetch a foreign package", () => {
    const expected = { pnpm: "pnpm exec kestrel", npm: "npm exec --no -- kestrel", yarn: "yarn kestrel", bun: "bun run kestrel" } as const;
    for (const packageManager of ["pnpm", "npm", "yarn", "bun"] as const) {
      const readme = text(files({ packageManager }), "README.md");
      expect(readme, packageManager).not.toMatch(/\b(?:npx|bunx|dlx)\s+(?:-y\s+|--yes\s+)?kestrel\b/);
      expect(readme, packageManager).toContain(`${expected[packageManager]} explain`);
    }
  });

  it("writes the commands of the chosen package manager into the README", () => {
    expect(text(files({ packageManager: "npm" }), "README.md")).toContain("npm run dev");
    expect(text(files({ packageManager: "yarn" }), "README.md")).toContain("yarn dev");
    expect(text(files({}), "README.md")).toContain("pnpm install");
  });

  it("names no pnpm command in the README of a project scaffolded with another package manager", () => {
    for (const packageManager of ["npm", "yarn", "bun"] as const) expect(text(files({ packageManager }), "README.md"), packageManager).not.toContain("pnpm");
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
