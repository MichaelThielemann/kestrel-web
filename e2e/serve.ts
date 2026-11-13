import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, PORT, REPO_ROOT, SERVER_LOG, SITE_URL, WORK_DIR } from "./support/env.ts";

const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
delete env.TEST;

rmSync(WORK_DIR, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });

if (process.env.KESTREL_E2E_SKIP_BUILD !== "1") {
  const build = spawnSync("pnpm", ["build"], { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"], env });
  if (build.status !== 0) {
    console.error(`the playground build failed with status ${String(build.status)}`);
    process.exit(1);
  }
}

const log = openSync(SERVER_LOG, "w");
const server = spawn(process.execPath, [join(REPO_ROOT, "playground", ".output", "server", "index.mjs")], {
  stdio: ["ignore", log, log],
  env: { ...env, PORT: String(PORT), NITRO_PORT: String(PORT), NITRO_HOST: "127.0.0.1", KESTREL_DATA_DIR: DATA_DIR, KESTREL_PLAYGROUND_LOGIN_LIMIT: "100", ...(process.env.KESTREL_E2E_VISUAL === "1" ? {} : { NUXT_PUBLIC_SITE_URL: SITE_URL }) },
});

closeSync(log);

const stop = (): void => {
  server.kill("SIGTERM");
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

server.on("exit", (code) => {
  rmSync(WORK_DIR, { recursive: true, force: true });
  process.exit(code ?? 0);
});
