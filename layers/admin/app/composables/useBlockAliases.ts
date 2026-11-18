import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { boundaryCast } from '#kestrel/cast'
import { BLOCK_ALIASES_FIELD, hasBlockAliases } from '../utils/collections'
import { type LocaleAliasMaps, withLocaleAliasMap } from '../utils/block-tree'

/** The current locale's alias map and its writer, as `useBlockTree` takes them. */
export interface BlockAliasBinding {
  aliases: ComputedRef<Record<string, string> | undefined>
  setAliases: (map: Record<string, string>) => void
}

export interface UseBlockAliasesOptions {
  /** The collection's served fields; the binding exists only when they contain `blockAliases`. */
  fields: Record<string, unknown>
  values: Record<string, unknown>
  locale: Ref<string>
  setField: (name: string, value: unknown, coalesceAs?: string) => void
}

/**
 * Binds a blocks editor's aliases to the collection's `blockAliases` field, one map per locale, writing
 * only the current locale's map. Returns `null` when the served fields have no `blockAliases`: the
 * editor then shows no alias input and no alias matches, and never writes the field.
 */
export function useBlockAliases(opts: UseBlockAliasesOptions): BlockAliasBinding | null {
  if (!hasBlockAliases(opts.fields)) return null
  const { values, locale, setField } = opts
  const maps = computed(() => boundaryCast<LocaleAliasMaps | undefined>(values[BLOCK_ALIASES_FIELD], 'json'))
  return {
    aliases: computed(() => maps.value?.[locale.value]),
    setAliases: (map) => setField(BLOCK_ALIASES_FIELD, withLocaleAliasMap(maps.value, locale.value, map), 'content:aliases'),
  }
}
