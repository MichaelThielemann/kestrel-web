import { getKestrel, getKestrelState } from "../plugins/kestrel";
import { readinessFromHealth } from "../utils/readiness";

const started = Date.now();

export default defineEventHandler(async (event) => {
  const status = getKestrelState();
  if (status.state !== "ready") {
    setResponseStatus(event, 503);
    return { ready: false, ...status, code: status.state };
  }

  const kestrel = await getKestrel();
  const readiness = readinessFromHealth(kestrel);
  if (!readiness.ready) {
    setResponseStatus(event, 503);
    return readiness;
  }

  return { ready: true, uptimeSeconds: Math.floor((Date.now() - started) / 1000) };
});
