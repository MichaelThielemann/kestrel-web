import { spawnSync } from "node:child_process";
import { PORT, REPO_ROOT, VISUAL_IMAGE } from "./support/env.ts";

const build = spawnSync("pnpm", ["build"], { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_ENV: "production" } });
if (build.status !== 0) {
  console.error(`the playground build failed with status ${String(build.status)}`);
  process.exit(1);
}

const run = spawnSync(
  "podman",
  [
    "run", "--rm",
    "--network", "host",
    "--userns", "keep-id",
    "--security-opt", "label=disable",
    "-v", `${REPO_ROOT}:/work`,
    "-w", "/work",
    "-e", "HOME=/tmp",
    "-e", "KESTREL_E2E_VISUAL=1",
    "-e", "KESTREL_E2E_SKIP_BUILD=1",
    "-e", `KESTREL_E2E_PORT=${String(PORT)}`,
    VISUAL_IMAGE,
    "node", "node_modules/@playwright/test/cli.js", "test", "--config", "e2e/playwright.config.ts", "--project", "visual",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(run.status ?? 1);
