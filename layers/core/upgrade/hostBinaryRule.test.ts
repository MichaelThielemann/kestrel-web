import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyEdits } from "@michaelthielemann/kestrel-upgrade/codemods";
import type { Finding, SourceRuleContext } from "@michaelthielemann/kestrel-upgrade/plugin";
import { hostBinaryRule, rewriteHostBinary, runsUnscopedHostBinary } from "./hostBinaryRule";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): SourceRuleContext {
  const root = mkdtempSync(join(tmpdir(), "kestrel-web-host-binary-"));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return {
    root,
    scratch: root,
    readFile: (file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return undefined;
      }
    },
    answers: new Map(),
  };
}

function packageJson(scripts: Record<string, string>): string {
  return `${JSON.stringify({ name: "example-site", scripts, dependencies: { "@michaelthielemann/kestrel-web": "^3.0.0" } }, null, 2)}\n`;
}

async function findings(ctx: SourceRuleContext): Promise<readonly Finding[]> {
  return hostBinaryRule.check(ctx);
}

describe("rewriteHostBinary", () => {
  it.each([
    ["kestrel-web-upgrade check", "kestrel upgrade check"],
    ["pnpm kestrel-web-upgrade fix --write", "pnpm kestrel upgrade fix --write"],
    ["pnpm exec kestrel-web-upgrade check", "pnpm exec kestrel upgrade check"],
    ["npm exec -- kestrel-web-upgrade check", "kestrel upgrade check"],
    ["pnpm dlx kestrel-web-upgrade check", "kestrel upgrade check"],
    ["bunx kestrel-web-upgrade check", "kestrel upgrade check"],
    ["yarn kestrel-web-upgrade data --db data/kestrel.db", "yarn kestrel upgrade data --db data/kestrel.db"],
    ["cross-env KESTREL_UPGRADE_FORCE_MAJOR=6 kestrel-web-upgrade check", "cross-env KESTREL_UPGRADE_FORCE_MAJOR=6 kestrel upgrade check"],
    ["KESTREL_UPGRADE_FORCE_MAJOR=6 kestrel-web-upgrade check", "KESTREL_UPGRADE_FORCE_MAJOR=6 kestrel upgrade check"],
    ["npx kestrel-web-upgrade check", "kestrel upgrade check"],
    ["npx -y kestrel-web-upgrade check", "kestrel upgrade check"],
    ["./node_modules/.bin/kestrel-web-upgrade check", "./node_modules/.bin/kestrel upgrade check"],
    ["nuxt build && kestrel-web-upgrade check --json", "nuxt build && kestrel upgrade check --json"],
  ])("%s → %s", (before, after) => {
    expect(rewriteHostBinary(before)).toBe(after);
  });

  it("leaves a longer word and other commands alone", () => {
    for (const command of ["kestrel-web-upgrade-notes", "echo my-kestrel-web-upgrade", "kestrel upgrade check", "nuxt build"]) {
      expect(rewriteHostBinary(command)).toBe(command);
    }
  });

  it("recognises every runner that can fetch the unscoped name, and none that runs the installed command", () => {
    for (const command of ["npx kestrel-web-upgrade check", "npx -y kestrel-web-upgrade check", "FOO=1 npx kestrel-web-upgrade check", "npm exec kestrel-web-upgrade check", "pnpm dlx kestrel-web-upgrade check", "yarn dlx kestrel-web-upgrade check", "bunx kestrel-web-upgrade check", "RUN npx kestrel-web-upgrade check"]) {
      expect(runsUnscopedHostBinary(command), command).toBe(true);
    }
    for (const command of ["pnpm exec kestrel-web-upgrade check", "npm exec --no -- kestrel-web-upgrade check", "yarn kestrel-web-upgrade check", "kestrel-web-upgrade check"]) {
      expect(runsUnscopedHostBinary(command), command).toBe(false);
    }
  });
});

describe("hostBinaryRule", () => {
  it("rewrites a package.json script to kestrel upgrade, without editing a dependency", async () => {
    const ctx = projectWith({ "package.json": packageJson({ upgrade: "kestrel-web-upgrade check", build: "nuxt build" }) });
    const result = await findings(ctx);
    expect(result).toHaveLength(1);
    const [finding] = result;
    expect(finding).toMatchObject({ rule: "scripts/host-binary", severity: "error", fix: { kind: "auto" } });
    const edits = finding?.fix.kind === "auto" ? finding.fix.edits : [];
    const file = join(ctx.root, "package.json");
    const applied = applyEdits(readFileSync(file, "utf8"), edits).text;
    expect(JSON.parse(applied)).toEqual(JSON.parse(packageJson({ upgrade: "kestrel upgrade check", build: "nuxt build" })));
  });

  it("names the unrelated registry package an unscoped npx would fetch, and still rewrites it", async () => {
    const [finding] = await findings(projectWith({ "package.json": packageJson({ upgrade: "npx kestrel-web-upgrade fix" }) }));
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("unscoped npx");
    expect(finding?.suggestion).toBe('run "kestrel upgrade fix" instead');
  });

  it("warns with file and line about the command in other project files, and skips Markdown and node_modules", async () => {
    const ctx = projectWith({
      "package.json": packageJson({}),
      "Dockerfile": "FROM node:22\nRUN pnpm exec kestrel-web-upgrade check\n",
      "deploy/upgrade.sh": "#!/bin/sh\nnode node_modules/@michaelthielemann/kestrel-web/bin/kestrel-web-upgrade.mjs check\n",
      "README.md": "run kestrel-web-upgrade check\n",
      "node_modules/example/run.js": "kestrel-web-upgrade check\n",
    });
    const result = await findings(ctx);
    expect(result.map((f) => [f.where.file?.slice(ctx.root.length + 1), f.where.line, f.severity, f.fix.kind])).toEqual([
      ["Dockerfile", 2, "warning", "manual"],
      ["deploy/upgrade.sh", 2, "warning", "manual"],
    ]);
    expect(result[0]?.suggestion).toBe("change the line to: RUN pnpm exec kestrel upgrade check");
  });

  it("reports an unscoped npx of the command in another project file or in Markdown as an error", async () => {
    const ctx = projectWith({
      "package.json": packageJson({}),
      "Dockerfile": "FROM node:22\nRUN npx kestrel-web-upgrade check\n",
      "README.md": "Upgrade with\n\n    npx -y kestrel-web-upgrade check\n",
    });
    const result = await findings(ctx);
    expect(result.map((f) => [f.where.file?.slice(ctx.root.length + 1), f.where.line, f.severity]).sort()).toEqual([
      ["Dockerfile", 2, "error"],
      ["README.md", 3, "error"],
    ]);
    for (const f of result) expect(f.suggestion).toContain("pnpm exec kestrel upgrade");
  });

  it("finds nothing on a project that already runs kestrel upgrade", async () => {
    expect(await findings(projectWith({ "package.json": packageJson({ upgrade: "kestrel upgrade check" }) }))).toEqual([]);
  });
});
