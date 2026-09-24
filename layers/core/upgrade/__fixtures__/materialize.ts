import { cpSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const ROOT_NODE_MODULES = join(REPO_ROOT, "node_modules");

/**
 * Copies a fixture under `__fixtures__/<name>` into a fresh temp directory with its own `node_modules`:
 * every top-level entry of this repository's own `node_modules` is symlinked in (so `nuxt`, the tarball-
 * installed `@michaelthielemann/kestrel*` backend packages and `jiti` all resolve exactly as they do here),
 * plus one extra entry, `@michaelthielemann/kestrel-web`, symlinked to this repository's own root as the
 * fixture's own installed copy of the layer.
 */
export function materializeFixture(name: string): string {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), name);
  const dir = mkdtempSync(join(tmpdir(), `kestrel-web-upgrade-${name}-`));
  cpSync(source, dir, { recursive: true });

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
