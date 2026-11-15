import type { Kestrel } from "@michaelthielemann/kestrel";
import type { InstanceHealth } from "@michaelthielemann/kestrel/defineModule";

export interface ReadinessDegraded {
  ready: false;
  state: "degraded";
  error: string;
  code: "degraded";
}

export interface ReadinessOk {
  ready: true;
}

type FailingModule = InstanceHealth["modules"][number] & { ok: false };

function firstFailure(health: InstanceHealth): FailingModule | undefined {
  for (const module of health.modules) {
    if (!module.ok) return module;
  }
  return undefined;
}

function firstRestartRequired(health: InstanceHealth): FailingModule | undefined {
  for (const module of health.modules) {
    if (!module.ok && module.restartRequired) return module;
  }
  return undefined;
}

/**
 * Reports degraded from `kestrel.health()` rather than from a call outcome: a module's health hook is
 * synchronous, does no I/O and never reports contention, so this never flaps under load the way probing
 * a call would. Names the first unhealthy module and its reason.
 */
export function readinessFromHealth(kestrel: Pick<Kestrel, "health">): ReadinessOk | ReadinessDegraded {
  const health = kestrel.health();
  if (health.ok) return { ready: true };
  const failing = firstFailure(health);
  const error = failing === undefined ? "instance reports unhealthy" : `${failing.module}: ${failing.reason}`;
  return { ready: false, state: "degraded", error, code: "degraded" };
}

export interface LivenessOk {
  live: true;
}

export interface LivenessRestartRequired {
  live: false;
  error: string;
}

/** Reports `live: false` only when `kestrel.health()` says the process cannot recover on its own. */
export function livenessFromHealth(kestrel: Pick<Kestrel, "health">): LivenessOk | LivenessRestartRequired {
  const health = kestrel.health();
  if (!health.restartRequired) return { live: true };
  const failing = firstRestartRequired(health);
  const error = failing === undefined ? "instance reports it needs a restart" : `${failing.module}: ${failing.reason}`;
  return { live: false, error };
}

/** Whole seconds since the server process started, the `uptimeSeconds` both probes report. */
export function uptimeSeconds(): number {
  return Math.floor(process.uptime());
}
