import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const ROOT_NODE_MODULES = join(REPO_ROOT, "node_modules");

const active = new Set<string>();
let signalHandlerInstalled = false;

function removeDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // already gone
  }
  active.delete(dir);
}

function removeAllActive(): void {
  for (const dir of [...active]) removeDir(dir);
}

/**
 * A test file calls `cleanupAllFixtures()` in its own `afterEach` for the normal pass/fail/throw cases
 * (this module stays framework-agnostic on purpose, so a plain script can use `materializeFixture` too);
 * this handles the one case a hook can't, a process killed by `SIGINT`/`SIGTERM` — cleaned up first, then
 * re-raised through Node's own default disposition rather than swallowed.
 */
function installSignalHandler(): void {
  if (signalHandlerInstalled) return;
  signalHandlerInstalled = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      removeAllActive();
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    });
  }
}

/**
 * Copies a fixture under `__fixtures__/<name>` into a fresh temp directory with its own `node_modules`:
 * every top-level entry of this repository's own `node_modules` is symlinked in (so `nuxt`, the tarball-
 * installed `@michaelthielemann/kestrel*` backend packages and `jiti` all resolve exactly as they do here),
 * plus one extra entry, `@michaelthielemann/kestrel-web`, symlinked to this repository's own root as the
 * fixture's own installed copy of the layer.
 */
export function materializeFixture(name: string): string {
  return materializeProject(`kestrel-web-upgrade-${name}`, (dir) => {
    cpSync(resolve(dirname(fileURLToPath(import.meta.url)), name), dir, { recursive: true });
  });
}

/** Like `materializeFixture()`, for a project whose files `fill` writes into the fresh directory. */
export function materializeProject(prefix: string, fill: (dir: string) => void): string {
  installSignalHandler();
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  active.add(dir);
  fill(dir);

  const nodeModules = join(dir, "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  const rootScope = join(ROOT_NODE_MODULES, "@michaelthielemann");
  const scope = join(nodeModules, "@michaelthielemann");
  mkdirSync(scope, { recursive: true });
  for (const entry of readdirSync(ROOT_NODE_MODULES)) {
    if (entry === "@michaelthielemann") continue;
    symlinkSync(join(ROOT_NODE_MODULES, entry), join(nodeModules, entry));
  }
  for (const entry of readdirSync(rootScope)) {
    symlinkSync(join(rootScope, entry), join(scope, entry));
  }
  symlinkSync(REPO_ROOT, join(scope, "kestrel-web"));

  return dir;
}

export { removeAllActive as cleanupAllFixtures, removeDir as cleanupFixture };
