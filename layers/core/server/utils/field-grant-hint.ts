import { KestrelBootError } from "@michaelthielemann/kestrel";

const UNCUT_GRANT = /anonymousFields grants fields of "([^"]+)", but no pipeline ends with authz\.fields:/g;

/**
 * `authz-roles` refuses a grant whose resource no pipeline cuts. A grant `presetModuleConfig()` derived is
 * one when it was not given the `exclude` and `overrides` `definePreset()` got; returns the fix for each such
 * resource named in an `authz/roles` boot problem, `undefined` for any other problem.
 */
export function fieldGrantHint(module: string, reason: string): string | undefined {
  if (module !== "authz/roles") return undefined;
  const resources = [...new Set([...reason.matchAll(UNCUT_GRANT)].map((match) => match[1] ?? ""))];
  if (resources.length === 0) return undefined;
  const names = resources.map((resource) => `"${resource}"`).join(", ");
  return `${names}: pass the same exclude and overrides to presetModuleConfig({ pipelines }) and definePreset(), or, for a grant you named in roles.anonymousFields, end a pipeline with its authz.fields step`;
}

/** The boot error with `fieldGrantHint()` appended when it has one, any other error unchanged. */
export function withFieldGrantHint(err: unknown): unknown {
  if (!(err instanceof KestrelBootError)) return err;
  const hint = fieldGrantHint(err.module, err.reason);
  return hint === undefined ? err : new KestrelBootError(err.module, `${err.reason}\n${hint}`, err.code);
}
