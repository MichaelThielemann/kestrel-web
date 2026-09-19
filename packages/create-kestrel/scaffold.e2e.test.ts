import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ENABLED = process.env.KESTREL_CREATE_E2E === "1";
const PORT = 3018;
const BASE_URL = `http://localhost:${PORT}`;
const PASSWORD = "scaffolded-passphrase";
const BOOT_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 1_800_000;

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI = fileURLToPath(new URL("./index.mjs", import.meta.url));

let workspace: string | null = null;
let server: ReturnType<typeof spawn> | null = null;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${String(result.status)}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result.stdout;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, logPath: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  let log: string;
  try {
    log = readFileSync(logPath, "utf8").split("\n").slice(-40).join("\n");
  } catch {
    log = "(no output)";
  }
  throw new Error(`the dev server did not answer in time\n${log}`);
}

function stopServer() {
  const child = server;
  server = null;
  if (child?.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

afterAll(() => {
  stopServer();
  if (workspace !== null) rmSync(workspace, { recursive: true, force: true });
});

describe.skipIf(!ENABLED)("a scaffolded project", () => {
  it("installs, typechecks, boots and lets the chosen admin log in", async () => {
    workspace = mkdtempSync(join(tmpdir(), "kestrel-create-"));
    const project = join(workspace, "my-site");

    run("pnpm", ["pack", "--pack-destination", workspace], REPO_ROOT);
    const tarball = readdirSync(workspace).find((entry) => entry.endsWith(".tgz"));
    expect(tarball).toBeDefined();

    run(process.execPath, [CLI, project, "--yes", "--pm", "pnpm", "--locales", "de,en", "--admin-user", "admin", "--admin-password", PASSWORD], workspace);

    const manifestPath = join(project, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dependencies["@michaelthielemann/kestrel-web"] = `file:${join(workspace, String(tarball))}`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    run("pnpm", ["install", "--no-frozen-lockfile"], project);
    run("pnpm", ["exec", "nuxt", "typecheck"], project);

    const logPath = join(workspace, "dev-server.log");
    const log = openSync(logPath, "w");
    server = spawn("pnpm", ["exec", "nuxt", "dev"], {
      cwd: project,
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT), NUXT_PORT: String(PORT) },
    });
    closeSync(log);

    await waitFor(async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/health`);
        return response.ok;
      } catch {
        return false;
      }
    }, BOOT_TIMEOUT_MS, logPath);

    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    const session = await login.json();
    const token = session.token ?? session.data?.token;
    expect(typeof token).toBe("string");

    const schema = await fetch(`${BASE_URL}/api/admin/schema`, { headers: { authorization: `Bearer ${String(token)}` } });
    expect(schema.status).toBe(200);
    const model = await schema.json();
    expect(model.locales.all).toEqual(["de", "en"]);
    expect(model.collections.map((collection: { name: string }) => collection.name)).toContain("pages");

    const site = await fetch(`${BASE_URL}/`);
    expect(site.status).toBeLessThan(500);

    stopServer();
  }, TEST_TIMEOUT_MS);
});
