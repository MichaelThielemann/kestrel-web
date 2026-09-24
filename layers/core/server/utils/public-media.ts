import { routePattern, type Route } from "@michaelthielemann/kestrel";
import { MEDIA_PUBLIC_PATH } from "../../mount-path";

const FILE_PATTERN = `GET ${MEDIA_PUBLIC_PATH}/:/:`;
const VARIANT_PATTERN = `GET ${MEDIA_PUBLIC_PATH}/:/variants/:`;

/** The trigger-table routes the direct `/media/**` Node handler answers: the file route and, when `images-default` is loaded, the variant route. Nothing else under `/media` (the API's `/media/:id`, `/media/folders`, …) is reachable outside `/api`. */
export function publicMediaRoutes(routes: readonly Route[]): Route[] {
  return routes.filter((route) => {
    const pattern = routePattern(route);
    return pattern === FILE_PATTERN || pattern === VARIANT_PATTERN;
  });
}
