import { routePattern, type Kestrel, type Logger, type Route } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import type { EventHandler } from "h3";
import { MEDIA_PUBLIC_PATH } from "../../mount-path";
import { clientIpOptions, type ClientAddressPolicy } from "./ip-allowlist";

const FILE_PATTERN = `GET ${MEDIA_PUBLIC_PATH}/:/:`;
const VARIANT_PATTERN = `GET ${MEDIA_PUBLIC_PATH}/:/variants/:`;

/** The trigger-table routes the direct `/media/**` Node handler answers: the file route and, when `images-default` is loaded, the variant route. Nothing else under `/media` (the API's `/media/:id`, `/media/folders`, …) is reachable outside `/api`. */
export function publicMediaRoutes(routes: readonly Route[]): Route[] {
  return routes.filter((route) => {
    const pattern = routePattern(route);
    return pattern === FILE_PATTERN || pattern === VARIANT_PATTERN;
  });
}

/** The handler behind `/media/**` on the site root: it runs only `publicMediaRoutes`, with no mount prefix, so an API route under `/media` never answers there. With `logger`, it writes one `http` line per request. */
export function createPublicMediaHandler(kestrel: Pick<Kestrel, "run" | "triggers">, policy: ClientAddressPolicy, logger?: Logger): EventHandler {
  return createKestrelHandler(
    { run: kestrel.run.bind(kestrel), triggers: { http: publicMediaRoutes(kestrel.triggers.http), events: [], crons: [] } },
    { mountPath: "", ...clientIpOptions(policy), ...(logger === undefined ? {} : { logger }) },
  );
}
