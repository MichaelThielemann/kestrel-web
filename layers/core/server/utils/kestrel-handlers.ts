import type { Kestrel, Logger } from "@michaelthielemann/kestrel";
import { createKestrelHandler } from "@michaelthielemann/kestrel-h3";
import { createError, defineEventHandler, type EventHandler } from "h3";
import { redactingConflictLabels } from "./conflict-labels";
import { MOUNT_PATH } from "../../mount-path";
import { bootFailure, type KestrelStatus } from "./boot-failure";
import { clientIpOptions, type ClientAddressPolicy } from "./ip-allowlist";
import { createPublicMediaHandler } from "./public-media";

export interface KestrelHandlerWiring {
  /** Receives one `http` line per request on both handlers, refusals before the pipeline included. */
  logger: Logger;
  /** The client-address policy, read once the instance has booted. */
  policy: () => ClientAddressPolicy;
  /** Content types the API serves inline rather than as attachments. */
  inlineTypes: (kestrel: Kestrel) => readonly string[];
  /** The largest request body the API accepts, `undefined` for no limit. */
  maxBodyBytes: (kestrel: Kestrel) => number | undefined;
  /** Called with the error when the boot promise rejects, before the 503 handlers are installed. */
  onBootFailure: (err: unknown) => void;
  /** The boot status the 503 answer carries. */
  status: () => KestrelStatus;
}

export interface KestrelHandlers {
  /** Answers the API under `MOUNT_PATH`. */
  kestrelHandler: Promise<EventHandler>;
  /** Answers `/media/**` on the site root with the public file and variant routes only. */
  publicMediaHandler: Promise<EventHandler>;
}

/** Both HTTP handlers of the Nitro plugin, built from the booting instance; when boot fails, each answers 503 with the boot status. */
export function kestrelHandlers(booting: Promise<Kestrel>, wiring: KestrelHandlerWiring): KestrelHandlers {
  const failed = (err: unknown): EventHandler => {
    wiring.onBootFailure(err);
    return defineEventHandler(() => {
      throw createError(bootFailure(wiring.status()));
    });
  };
  return {
    kestrelHandler: booting
      .then((kestrel) => defineEventHandler(redactingConflictLabels(kestrel, createKestrelHandler(kestrel, {
        mountPath: MOUNT_PATH,
        logger: wiring.logger,
        ...clientIpOptions(wiring.policy()),
        inlineTypes: wiring.inlineTypes(kestrel),
        maxBodyBytes: wiring.maxBodyBytes(kestrel),
      }))))
      .catch(failed),
    publicMediaHandler: booting.then((kestrel) => createPublicMediaHandler(kestrel, wiring.policy(), wiring.logger)).catch(failed),
  };
}
