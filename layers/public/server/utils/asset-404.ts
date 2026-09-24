import { MEDIA_PUBLIC_PATH, MOUNT_PATH } from "#kestrel-core/mount-path";

const FILE_PATH = /\.[a-z0-9]{1,8}$/i;
const PASS = new RegExp(`^(${[MOUNT_PATH, MEDIA_PUBLIC_PATH, "/_nuxt", "/__nuxt", "/_ipx"].map((p) => p.replace(/\//g, "\\/")).join("|")})\\/`);

/** Whether a request path that looks like a static file (an extension, not `.html`) and is not under the server's own mounts (`/api`, `/media`, `/_nuxt`, `/__nuxt`, `/_ipx`) should answer 404 instead of falling through to the SPA shell. */
export function isMissingAsset(path: string): boolean {
  return FILE_PATH.test(path) && !PASS.test(path) && !path.endsWith(".html");
}
