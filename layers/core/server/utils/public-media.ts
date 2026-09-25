import { routePattern, type Kestrel, type Route } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import type { EventHandler } from "h3";
import { MEDIA_PUBLIC_PATH } from "../../mount-path";
import type { ClientAddressPolicy } from "./ip-allowlist";

const FILE_PATTERN = `GET ${MEDIA_PUBLIC_PATH}/:/:`;
const VARIANT_PATTERN = `GET ${MEDIA_PUBLIC_PATH}/:/variants/:`;

/** The trigger-table routes the direct `/media/**` Node handler answers: the file route and, when `images-default` is loaded, the variant route. Nothing else under `/media` (the API's `/media/:id`, `/media/folders`, …) is reachable outside `/api`. */
export function publicMediaRoutes(routes: readonly Route[]): Route[] {
  return routes.filter((route) => {
    const pattern = routePattern(route);
    return pattern === FILE_PATTERN || pattern === VARIANT_PATTERN;
  });
}

/** The client-address options a Kestrel h3 handler takes from the access policy. */
export function clientAddressOptions(policy: ClientAddressPolicy): { trustProxy: boolean; proxyHops: number; trustedHeader?: string } {
  const { trustProxy, proxyHops, trustedHeader } = policy;
  return { trustProxy, proxyHops, ...(trustedHeader === "" ? {} : { trustedHeader }) };
}

/** The handler behind `/media/**` on the site root: it runs only `publicMediaRoutes`, with no mount prefix, so an API route under `/media` never answers there. */
export function createPublicMediaHandler(kestrel: Pick<Kestrel, "run" | "triggers">, policy: ClientAddressPolicy): EventHandler {
  return createKestrelHandler(
    { run: kestrel.run.bind(kestrel), triggers: { http: publicMediaRoutes(kestrel.triggers.http), events: [], crons: [] } },
    { mountPath: "", ...clientAddressOptions(policy) },
  );
}
