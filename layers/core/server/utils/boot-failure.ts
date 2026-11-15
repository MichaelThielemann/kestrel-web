import { isKestrelBootError, type Logger } from "@michaelthielemann/kestrel";

export type KestrelState = "booting" | "ready" | "failed";

export interface KestrelStatus {
  state: KestrelState;
  error?: string;
}

export interface BootFailure {
  statusCode: number;
  statusMessage: string;
  data: KestrelStatus;
}

export const BOOT_FAILED_MESSAGE = "Kestrel failed to boot";

export function bootFailure(status: KestrelStatus): BootFailure {
  return { statusCode: 503, statusMessage: BOOT_FAILED_MESSAGE, data: status };
}

export interface BootBannerInput {
  module: string;
  reason: string;
  code?: string;
}

export interface BootReportOptions {
  logger: Pick<Logger, "error">;
  /** In development the server keeps running and answers 503; otherwise the process exits with 1. */
  dev: boolean;
  exit: (code: number) => void;
}

const RULE = "================================================================";
const INSTANCE_LOCKED = "instance-locked";
const LOCK_HOLDER = /host "([^"]*)", pid (\d+)/;
const LOCK_NOT_TAKEN = "could not take the instance lock";
const LOCK_UNREADABLE = "which is unreadable";
const OTHER_NAMESPACE = "comes from another PID namespace";
const STOP_OR_OPT_OUT = "  stop it and restart the server, or set allowConcurrentProcesses: true to run several processes on one database on purpose";

function lockHintLines(reason: string): string[] {
  const holder = LOCK_HOLDER.exec(reason);
  const named = holder === null ? "" : `host "${holder[1] ?? ""}", pid ${holder[2] ?? ""}`;
  if (reason.includes(LOCK_NOT_TAKEN)) {
    return [named === "" ? "  another process is taking or holding the lock; retry by restarting the server once it has settled" : `  another process is taking over the lock: ${named}; retry by restarting the server once it has finished`];
  }
  if (holder !== null && reason.includes(OTHER_NAMESPACE)) {
    return [`  the lock comes from an earlier run in another PID namespace: ${named} there; if no process uses the database any more, delete the lock file named above or restart the server once the takeover time has passed`];
  }
  if (holder !== null) return [`  another process is running on this database: ${named}`, STOP_OR_OPT_OUT];
  if (reason.includes(LOCK_UNREADABLE)) return ["  another process holds this database; the lock file names no host or PID", STOP_OR_OPT_OUT];
  return ["  another process is taking or holding the lock; see the reason above"];
}

function hintLines(input: BootBannerInput): string[] {
  if (input.code !== INSTANCE_LOCKED) return ["  fix kestrel.config.ts and restart"];
  return lockHintLines(input.reason);
}

/** The lines of the boot-failure banner; an instance lock held by another process names that process's host and PID. */
export function bootBanner(input: BootBannerInput): string[] {
  return [RULE, "  KESTREL FAILED TO BOOT", `  module: ${input.module}`, `  reason: ${input.reason}`, ...hintLines(input), RULE];
}

/** Logs the banner for a boot failure and, outside development, ends the process with exit code 1. Returns the message the status carries. */
export function reportBootFailure(err: unknown, options: BootReportOptions): string {
  const message = err instanceof Error ? err.message : String(err);
  const boot = isKestrelBootError(err) ? err : undefined;
  const module = boot?.module ?? "kestrel";
  const reason = boot?.reason ?? message;
  options.logger.error("kestrel failed to boot", { module, reason });
  for (const line of bootBanner({ module, reason, code: boot?.code })) options.logger.error(line);
  if (!options.dev) options.exit(1);
  return message;
}
