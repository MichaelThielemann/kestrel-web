import { getKestrel, getKestrelState } from "../plugins/kestrel";
import { probeBody } from "../utils/ip-allowlist";
import { readinessFromHealth, uptimeSeconds } from "../utils/readiness";

export default defineEventHandler(async (event) => {
  const status = getKestrelState();
  if (status.state !== "ready") {
    setResponseStatus(event, 503);
    return probeBody(event, { ready: false, ...status, code: status.state }, "ready");
  }

  const kestrel = await getKestrel();
  const readiness = readinessFromHealth(kestrel);
  if (!readiness.ready) {
    setResponseStatus(event, 503);
    return probeBody(event, readiness, "ready");
  }

  return probeBody(event, { ready: true, uptimeSeconds: uptimeSeconds() }, "ready");
});
