import { KestrelBootError } from "@michaelthielemann/kestrel";

const UNCUT_GRANT = /anonymousFields grants fields of "([^"]+)", but no pipeline ends with authz\.fields:/g;

/**
 * `authz-roles` refuses a grant whose resource no pipeline cuts. A grant `presetModuleConfig()` derived is
 * one when it was not given the `exclude` and `overrides` `definePreset()` got; returns the boot error with
 * that fix added for each such resource, and any other error unchanged.
 */
export function withFieldGrantHint(err: unknown): unknown {
  if (!(err instanceof KestrelBootError) || err.module !== "authz/roles") return err;
  const resources = [...new Set([...err.reason.matchAll(UNCUT_GRANT)].map((match) => match[1] ?? ""))];
  if (resources.length === 0) return err;
  const names = resources.map((resource) => `"${resource}"`).join(", ");
  const hint = `${names}: pass the same exclude and overrides to presetModuleConfig({ pipelines }) and definePreset(), or, for a grant you named in roles.anonymousFields, end a pipeline with its authz.fields step`;
  return new KestrelBootError(err.module, `${err.reason}\n${hint}`, err.code);
}
