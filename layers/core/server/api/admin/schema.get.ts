import { responseForRun } from "@michaelthielemann/kestrel";
import { boundaryCast } from "@michaelthielemann/kestrel/cast";
import { pipelines } from "#kestrel/consumer-pipelines";
import collectionsUi from "~~/shared/collections-ui";
import { defaultLocale, features, locales, prefixPrimary } from "~~/shared/model";
import { getKestrel } from "../../plugins/kestrel";
import { buildAdminSchema } from "../../utils/admin-schema";
import type { DescribedModel } from "../../utils/admin-schema";

const PIPELINE = "adminSchemaModel";
const TRIGGER_NAME = "GET /admin/schema";

export default defineEventHandler(async (event) => {
  const kestrel = await getKestrel();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (typeof value === "string") headers[key.toLowerCase()] = value;
  }

  const run = await kestrel.run(PIPELINE, { trigger: { kind: "http", name: TRIGGER_NAME }, headers });
  if (run.status >= 400) {
    const response = responseForRun(run);
    setResponseStatus(event, response.status);
    setResponseHeaders(event, response.headers);
    return response.body;
  }

  const model = boundaryCast<DescribedModel>(run.result, "json");
  return buildAdminSchema({
    model,
    collectionsUi,
    features,
    prefixPrimary,
    locales,
    defaultLocale,
    pipelines: pipelines.map((pipeline) => pipeline.name),
  });
});
