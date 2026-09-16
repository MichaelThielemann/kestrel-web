#!/usr/bin/env bash
# Packs the layer and the renderer, installs the tarballs into a throwaway Nuxt app outside the
# workspace that extends the layer, builds it, boots it and requests a few pages. Fails on the first problem.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${SMOKE_DIR:-$(mktemp -d)}"
PORT="${SMOKE_PORT:-3124}"
mkdir -p "$WORK/tarballs" "$WORK/consumer"

echo "== build packages"
(cd "$ROOT" && pnpm build:packages >/dev/null)

echo "== pack into $WORK/tarballs"
(cd "$ROOT" && pnpm pack --pack-destination "$WORK/tarballs" >/dev/null)
(cd "$ROOT/packages/renderer-nuxt" && pnpm pack --pack-destination "$WORK/tarballs" >/dev/null)
ls "$WORK/tarballs"

echo "== consumer project in $WORK/consumer"
cp -r "$ROOT/playground/app" "$ROOT/playground/shared" "$ROOT/playground/kestrel.config.ts" "$ROOT/playground/tsconfig.json" "$WORK/consumer/"
cd "$WORK/consumer"
LAYER_TGZ="$(ls "$WORK"/tarballs/michaelthielemann-kestrel-web-*.tgz)"
RENDERER_TGZ="$(ls "$WORK"/tarballs/michaelthielemann-kestrel-renderer-nuxt-*.tgz)"
node - "$ROOT/package.json" "$LAYER_TGZ" "$RENDERER_TGZ" > package.json <<'JS'
const [root, layer, renderer] = process.argv.slice(2);
const pkg = JSON.parse(require("node:fs").readFileSync(root, "utf8"));
const dependencies = { [pkg.name]: `file:${layer}`, "@michaelthielemann/kestrel-renderer-nuxt": `file:${renderer}` };
for (const name of Object.keys(pkg.peerDependencies)) dependencies[name] = pkg.peerDependencies[name];
console.log(JSON.stringify({ name: "smoke-consumer", private: true, type: "module", dependencies }, null, 2));
JS
cat > nuxt.config.ts <<TS
export default defineNuxtConfig({
  compatibilityDate: "2026-08-28",
  extends: ["@michaelthielemann/kestrel-web"],
});
TS
cat > pnpm-workspace.yaml <<YAML
minimumReleaseAgeExclude:
  - '@michaelthielemann/*'
overrides:
  "@michaelthielemann/kestrel-renderer-nuxt": "file:$RENDERER_TGZ"
allowBuilds:
  esbuild: true
  "@parcel/watcher": true
  unrs-resolver: true
  sharp: true
  vue-demi: false
YAML
pnpm install --reporter=silent
test -d node_modules/@michaelthielemann/kestrel-web/layers/core || { echo "layer sources missing from the tarball"; exit 1; }
test ! -e node_modules/@michaelthielemann/kestrel-web/layers/core/pipelines/__fixtures__ || { echo "fixtures leaked into the tarball"; exit 1; }
test -z "$(find node_modules/@michaelthielemann/kestrel-web/layers -name '*.test.ts' | head -1)" || { echo "tests leaked into the tarball"; exit 1; }

echo "== build"
pnpm exec nuxt build >"$WORK/build.log" 2>&1 || { tail -40 "$WORK/build.log"; exit 1; }
grep -q "Hero" .nuxt/kestrel/blocks.mjs || { echo "consumer blocks were not discovered"; exit 1; }
grep -q "kestrel-insights" .nuxt/kestrel/optional-modules.mjs || { echo "optional insights module was not picked up"; exit 1; }

echo "== boot on :$PORT"
PORT="$PORT" NITRO_HOST=127.0.0.1 node .output/server/index.mjs >"$WORK/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/admin/login" && break; sleep 1; done
check() { local code; code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1")"; echo "  $1 -> $code"; [[ " $2 " == *" $code "* ]] || { echo "unexpected status for $1"; cat "$WORK/server.log"; exit 1; }; }
check /admin/login "200"
check /admin/insights "200"
check /api/me "401"
check /api/admin/insights/manifest "401 403"
curl -s "http://127.0.0.1:$PORT/admin/login" | grep -q "<div id=\"__nuxt\">" || { echo "admin shell missing"; exit 1; }
echo "== ok ($WORK)"
