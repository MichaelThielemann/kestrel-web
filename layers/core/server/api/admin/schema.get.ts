import { responseForRun } from "@michaelthielemann/kestrel";
import fieldTypes from "#kestrel/field-types";
import collectionsUi from "~~/shared/collections-ui";
import { contentTypes, defaultLocale, features, locales, prefixPrimary } from "~~/shared/model";
import { customFieldTypes } from "../../../collections-ui";
import { getKestrel, getKestrelState } from "../../plugins/kestrel";
import { accessLists } from "../../plugins/access";
import { bootFailure } from "../../utils/boot-failure";
import { llmsFullOf, maxCascadeOf, robotsOf, schemaFromRun, sitemapOf } from "../../utils/admin-schema";
import config from "~~/kestrel.config";

const PIPELINE = "adminSchemaModel";
const TRIGGER_NAME = "GET /admin/schema";

export default defineEventHandler(async (event) => {
  const kestrel = await getKestrel().catch(() => undefined);
  if (kestrel === undefined) throw createError(bootFailure(getKestrelState()));

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (typeof value === "string") headers[key.toLowerCase()] = value;
  }
  const { ip } = accessLists().resolve(event.node.req);

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

  const schema = schemaFromRun(run, {
    collectionsUi,
    features,
    prefixPrimary,
    locales,
    defaultLocale,
    customTypes: customFieldTypes(contentTypes, fieldTypes),
    collections: contentTypes,
    maxCascade: maxCascadeOf(config.modules),
    llmsFull: llmsFullOf(config.modules),
    robots: robotsOf(config.modules),
    sitemap: sitemapOf(config.modules),
    triggers: kestrel.describe().triggers.http,
  });

  setResponseStatus(event, schema.status);
  setResponseHeaders(event, { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-kestrel-run-id": run.runId });
  return schema.body;
});
