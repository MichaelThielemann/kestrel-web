import { MEDIA_PUBLIC_PATH, MOUNT_PATH } from "#kestrel-core/mount-path";
import { INDEX_FILE_NAMES } from "#kestrel-core/pipelines/delivery-names";

const FILE_PATH = /\.[a-z0-9]{1,8}$/i;
const INDEX_FILES = new Set(INDEX_FILE_NAMES.map((file) => `/${file}`));
const PASS = new RegExp(`^(${[MOUNT_PATH, MEDIA_PUBLIC_PATH, "/_nuxt", "/__nuxt", "/_ipx"].map((p) => p.replace(/\//g, "\\/")).join("|")})\\/`);

/** Whether a request path that looks like a static file (an extension, not `.html`), is not under the server's own mounts (`/api`, `/media`, `/_nuxt`, `/__nuxt`, `/_ipx`) and is none of the exported index files (`/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/llms-full.txt`) should answer 404 instead of falling through to the SPA shell. */
export function isMissingAsset(path: string): boolean {
  return FILE_PATH.test(path) && !PASS.test(path) && !INDEX_FILES.has(path) && !path.endsWith(".html");
}
