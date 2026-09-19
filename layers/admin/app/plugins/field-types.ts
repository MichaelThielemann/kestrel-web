import fieldTypes from '#kestrel/field-types'
import { registerFieldEmpty } from '../utils/field-empty'

export default defineNuxtPlugin(() => {
  for (const [type, definition] of Object.entries(fieldTypes)) {
    const empty = definition.empty
    if (empty !== undefined) registerFieldEmpty(type, () => empty)
  }
})
