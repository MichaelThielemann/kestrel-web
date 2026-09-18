import { clientIp, responseForRun } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import collectionsUi from "~~/shared/collections-ui";
import { defaultLocale, features, locales, prefixPrimary } from "~~/shared/model";
import { getKestrel, getKestrelState } from "../../plugins/kestrel";
import { accessLists } from "../../plugins/access";
import { bootFailure } from "../../utils/boot-failure";
import { buildAdminSchema } from "../../utils/admin-schema";
import type { DescribedModel } from "../../utils/admin-schema";

const PIPELINE = "adminSchemaModel";
const TRIGGER_NAME = "GET /admin/schema";

export default defineEventHandler(async (event) => {
  const kestrel = await getKestrel().catch(() => undefined);
  if (kestrel === undefined) throw createError(bootFailure(getKestrelState()));

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (typeof value === "string") headers[key.toLowerCase()] = value;
  }
  const { trustProxy, proxyHops, trustedHeader } = accessLists().policy;
  const ip = clientIp(event.node.req, { trustProxy, proxyHops, ...(trustedHeader === "" ? {} : { trustedHeader }) });

  const run = await kestrel.run(PIPELINE, {
    trigger: { kind: "http", name: TRIGGER_NAME },
    headers,
    ...(ip === undefined ? {} : { ip }),
  });
  if (run.status >= 400) {
    const response = responseForRun(run);
    setResponseStatus(event, response.status);
    setResponseHeaders(event, response.headers);
    return response.body;
  }

  setResponseHeaders(event, { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-kestrel-run-id": run.runId });
  const model = boundaryCast<DescribedModel>(run.result, "json");
  return buildAdminSchema({ model, collectionsUi, features, prefixPrimary, locales, defaultLocale });
});
