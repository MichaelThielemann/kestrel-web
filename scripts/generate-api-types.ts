import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boot, silentLogger } from "@michaelthielemann/kestrel";
import { generateOpenApi } from "@michaelthielemann/kestrel-openapi";
import { definePreset, featureOrder, presetModuleConfig } from "../layers/core/pipelines/index.ts";
import { defineFieldTypes } from "../layers/core/field-types.ts";
import { contentModel, contentTypes } from "../playground/shared/model.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outFile = resolve(repoRoot, "layers/core/app/types/openapi.generated.ts");
const generatorCommand = "pnpm generate:api-types";

const fieldTypes = defineFieldTypes({
  color: { storage: "text", schema: { type: "string", pattern: "^#[0-9a-f]{6}$" }, empty: "#2266cc" },
});

const features = featureOrder;

const workDir = mkdtempSync(join(tmpdir(), "kestrel-openapi-"));

async function main(): Promise<void> {
  try {
    const schemaDir = join(workDir, "app-root");
    mkdirSync(join(schemaDir, "schemas"), { recursive: true });
    const bodySchemaPath = join(schemaDir, "pages.body.json");
    writeFileSync(bodySchemaPath, JSON.stringify({ type: "array" }));
    process.env.KESTREL_BLOCK_SCHEMA = bodySchemaPath;
    process.env.KESTREL_APP_ROOT = schemaDir;

    const dataDir = join(workDir, "data");
    mkdirSync(dataDir, { recursive: true });

    const modules = [
      ...presetModuleConfig({
        dataDir,
        blobstore: { use: "@michaelthielemann/kestrel-blobstore-filesystem", config: { root: join(dataDir, "blobs") } },
        model: contentModel,
        features,
        fieldTypes,
        audit: { retentionDays: 365 },
        migrations: { migrations: [] },
        eventsQueue: {},
        roles: { roles: { admin: ["*"] }, anonymous: ["media.read"] },
        bootstrap: {
          username: "admin",
          passwordHash: "scrypt$522f4ac87bfe4bcd100ba47a7d2aaec2$dbfc3f2d6cc38a76b21973d7c6f6d310a09506581c665f1f6601fd8fb3fa9bc3959689aea3e389f4d53eb8c7e70791ad4065e308763dd44609904134f0f5ee98",
        },
      }),
    ];

    const EXPORT_DIR = "/var/lib/kestrel/export";
    const preset = definePreset({ modules, features, collections: contentTypes, fieldTypes, exportDir: EXPORT_DIR });

    const { loadModules } = await import("@michaelthielemann/kestrel");
    const config = { modules, triggers: preset.triggers, http: null };
    const moduleDefinitions = await loadModules(repoRoot, config);
    const kestrel = await boot({ config, modules: moduleDefinitions, pipelines: preset.pipelines, logger: silentLogger });
    const doc = generateOpenApi(kestrel, { title: "@michaelthielemann/kestrel-web admin API", version: "0.0.0" });
    await kestrel.stop();

    const docPath = join(workDir, "openapi.json");
    writeFileSync(docPath, JSON.stringify(doc, null, 2));

    const generated = execFileSync(
      resolve(repoRoot, "node_modules/.bin/openapi-typescript"),
      [docPath, "--root-types", "--alphabetize"],
      { encoding: "utf8" },
    );

    const header = [
      "// This file is generated. Do not edit by hand.",
      `// Regenerate with \`${generatorCommand}\`.`,
      "",
    ].join("\n");
    const content = header + generated.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");

    const check = process.argv.includes("--check");
    if (check) {
      let current: string | undefined;
      try {
        current = readFileSync(outFile, "utf8");
      } catch {
        current = undefined;
      }
      if (current !== content) {
        process.stderr.write(`${outFile} is stale — run \`${generatorCommand}\`.\n`);
        process.exitCode = 1;
        return;
      }
      return;
    }

    writeFileSync(outFile, content);
    process.stderr.write(`wrote ${outFile}\n`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

await main();
