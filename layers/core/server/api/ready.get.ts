import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";
import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import { getKestrel, getKestrelState } from "../plugins/kestrel";
import { moduleConfigForStep } from "../utils/modules";

const CONTENT_CREATE_STEP = "content.create";
const started = Date.now();

function probeCollection(): string | undefined {
  const content = moduleConfigForStep(modules, config.modules, CONTENT_CREATE_STEP);
  const types = typeof content === "object" && content !== null ? (content as { types?: unknown }).types : undefined;
  if (typeof types !== "object" || types === null) return undefined;
  return Object.keys(types)[0];
}

export default defineEventHandler(async (event) => {
  const status = getKestrelState();
  if (status.state !== "ready") {
    setResponseStatus(event, 503);
    return { ready: false, ...status };
  }

  const collection = probeCollection();
  if (collection !== undefined) {
    try {
      await (await getKestrel()).contracts.find(PERSISTENCE)?.count(collection, {});
    } catch (err) {
      setResponseStatus(event, 503);
      return { ready: false, state: "degraded", error: `persistence unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return { ready: true, uptimeSeconds: Math.floor((Date.now() - started) / 1000) };
});
