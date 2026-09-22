import type { Kestrel } from "@michaelthielemann/kestrel";
import { isErr } from "@michaelthielemann/kestrel";
import { PERSISTENCE } from "@michaelthielemann/kestrel-contracts/persistence";

export interface ReadinessDegraded {
  ready: false;
  state: "degraded";
  error: string;
  code: "degraded";
}

export interface ReadinessOk {
  ready: true;
}

/**
 * Probes the persistence contract with a `count` on `collection`. Reports degraded both for a thrown
 * error (an unreachable store) and for a resolved `Err` (a store that answers every call with a failure,
 * as it does after a failed atomic-scope rollback) — a resolved `Err` never throws, so a caller awaiting
 * only a `try`/`catch` around this call would otherwise see a healthy instance.
 */
export async function probePersistence(kestrel: Pick<Kestrel, "contracts">, collection: string): Promise<ReadinessOk | ReadinessDegraded> {
  try {
    const probe = await kestrel.contracts.find(PERSISTENCE)?.count(collection, {});
    if (probe !== undefined && isErr(probe)) {
      return { ready: false, state: "degraded", error: `persistence degraded: ${probe.error.code}: ${probe.error.message}`, code: "degraded" };
    }
    return { ready: true };
  } catch (err) {
    return { ready: false, state: "degraded", error: `persistence unreachable: ${err instanceof Error ? err.message : String(err)}`, code: "degraded" };
  }
}
