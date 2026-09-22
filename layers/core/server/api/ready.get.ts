import type { Kestrel } from "@michaelthielemann/kestrel";
import modules from "#kestrel/consumer-modules";
import config from "~~/kestrel.config";
import { getKestrel, getKestrelState } from "../plugins/kestrel";
import { moduleConfigForStep } from "../utils/modules";
import { probePersistence } from "../utils/readiness";

const CONTENT_CREATE_STEP = "content.create";
const started = Date.now();

function probeCollection(kestrel: Kestrel): string | undefined {
  const content = moduleConfigForStep(modules, config.modules, kestrel.steps.owner(CONTENT_CREATE_STEP));
  const types = typeof content === "object" && content !== null ? (content as { types?: unknown }).types : undefined;
  if (typeof types !== "object" || types === null) return undefined;
  return Object.keys(types)[0];
}

export default defineEventHandler(async (event) => {
  const status = getKestrelState();
  if (status.state !== "ready") {
    setResponseStatus(event, 503);
    return { ready: false, ...status, code: status.state };
  }

  const kestrel = await getKestrel();
  const collection = probeCollection(kestrel);
  if (collection !== undefined) {
    const probe = await probePersistence(kestrel, collection);
    if (!probe.ready) {
      setResponseStatus(event, 503);
      return probe;
    }
  }

  return { ready: true, uptimeSeconds: Math.floor((Date.now() - started) / 1000) };
});
