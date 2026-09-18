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
