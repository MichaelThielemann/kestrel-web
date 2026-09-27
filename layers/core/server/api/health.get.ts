import { getKestrel, getKestrelState } from "../plugins/kestrel";
import { probeBody } from "../utils/ip-allowlist";
import { livenessFromHealth } from "../utils/readiness";

const started = Date.now();

export default defineEventHandler(async (event) => {
  const status = getKestrelState();
  if (status.state === "ready") {
    const kestrel = await getKestrel();
    const liveness = livenessFromHealth(kestrel);
    if (!liveness.live) {
      setResponseStatus(event, 503);
      return probeBody(event, { ok: false, error: liveness.error, uptimeSeconds: Math.floor((Date.now() - started) / 1000) }, "ok");
    }
  }

  return probeBody(event, { ok: true, uptimeSeconds: Math.floor((Date.now() - started) / 1000) }, "ok");
});
