import { moduleConfigForStep, moduleNameForStep, type ConfigEntry, type ModuleLike, type StepOwnerLookup } from "./modules";

export const MEDIA_UPLOAD_STEP = "media.upload";
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export interface UploadLimits {
  maxUploadBytes: number | null;
  maxBodyBytes: number | undefined;
}

export function uploadLimits(kestrel: StepOwnerLookup, modules: readonly ModuleLike[], entries: readonly ConfigEntry[]): UploadLimits {
  const owner = kestrel.steps.owner(MEDIA_UPLOAD_STEP);
  const config = moduleConfigForStep(modules, entries, owner);
  if (config === undefined) return { maxUploadBytes: null, maxBodyBytes: undefined };
  const maxBytes = typeof config === "object" && config !== null ? (config as { maxBytes?: unknown }).maxBytes : undefined;
  if (typeof maxBytes !== "number") {
    throw new Error(`kestrel-web: module "${moduleNameForStep(modules, owner) ?? MEDIA_UPLOAD_STEP}" registers "${MEDIA_UPLOAD_STEP}" but its config has no numeric "maxBytes" — the upload limit cannot be derived`);
  }
  return { maxUploadBytes: maxBytes, maxBodyBytes: maxBytes + MULTIPART_OVERHEAD_BYTES };
}
