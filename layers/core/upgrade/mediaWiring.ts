import type { LoadedProject, MediaWiring } from "@michaelthielemann/kestrel-upgrade/plugin";
import { MEDIA_PUBLIC_PATH, MOUNT_PATH } from "../mount-path";

/**
 * The layer's own, fixed media wiring (consuming-kestrel-web.md §6): the server always answers media and
 * image variants on `MEDIA_PUBLIC_PATH`, `publicCopy` always writes under the `"site/"` prefix, and
 * `delivery-static`'s `reservedPaths` always covers the API mount, the admin and the media mount. None of
 * this varies per project, so `modules/delivery-media` can always use it directly.
 */
export function layerMediaWiring(project: LoadedProject): MediaWiring | undefined {
  void project;
  return { publicPath: MEDIA_PUBLIC_PATH, copyPrefix: "site/", reservedPaths: [MOUNT_PATH, "/admin", MEDIA_PUBLIC_PATH] };
}
