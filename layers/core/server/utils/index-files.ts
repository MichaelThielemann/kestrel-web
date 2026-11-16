import { routePattern, type Kestrel, type Logger, type Route } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import type { EventHandler } from "h3";
import { INDEX_FILE_NAMES, indexFileRoute } from "../../pipelines/delivery-names";
import { clientIpOptions, type ClientAddressPolicy } from "./ip-allowlist";
import { withHeadRoutes } from "./public-media";

const INDEX_FILE_PATTERNS = new Set<string>(INDEX_FILE_NAMES.map(indexFileRoute));
const HEAD_PATTERNS = new Set<string>(INDEX_FILE_NAMES.map((file) => `HEAD /${file}`));

/** The media types of the exported index files, which the site root answers inline rather than as attachments. */
export const INDEX_FILE_INLINE_TYPES: readonly string[] = ["application/xml", "text/plain"];

/** The trigger-table routes that answer `/sitemap.xml`, `/robots.txt`, `/llms.txt` and `/llms-full.txt` on the site root, `GET` and `HEAD`. */
export function indexFileRoutes(routes: readonly Route[]): Route[] {
  return routes.filter((route) => {
    const pattern = routePattern(route);
    return INDEX_FILE_PATTERNS.has(pattern) || HEAD_PATTERNS.has(pattern);
  });
}

/**
 * The handler behind the index files on the site root: it runs only `indexFileRoutes` (with a `HEAD` twin of each
 * `GET`), with no mount prefix, and answers the bytes and content type of the last export, or 404 for a file the
 * export has not written. With `logger`, it writes one `http` line per request.
 */
export function createIndexFileHandler(kestrel: Pick<Kestrel, "run" | "triggers">, policy: ClientAddressPolicy, logger?: Logger): EventHandler {
  return createKestrelHandler(
    { run: kestrel.run.bind(kestrel), triggers: { http: indexFileRoutes(withHeadRoutes(kestrel.triggers.http)), events: [], crons: [] } },
    { mountPath: "", inlineTypes: INDEX_FILE_INLINE_TYPES, ...clientIpOptions(policy), ...(logger === undefined ? {} : { logger }) },
  );
}
