import { ref } from 'vue'
import { runAction } from '#kestrel-core/app/utils/actions'
import { restoreItems, type BulkReport } from '../actions/mediaTrash'
import { toastUnexpected } from '../actions/steps/notify'
import { restoreMessages, type RunMessage } from '../utils/media-removal'
import { notifyMediaChanged } from './useMediaChanges'

/** How long the undo toast stays while neither hovered nor focused. */
export const UNDO_TIMEOUT_MS = 8000

/** What the view shows in place of a toast: a message and, while it can still be undone, the undo. */
export interface UndoNotice { type: RunMessage['type']; message: string; undo?: () => void }

/** The undo of a move to the trash. In a toast by default; `inline` keeps the offer and the outcome in `notice` for the view to show, which a modal dialog needs because a toast outside it is out of reach. The restore reloads every mounted media view, not only the one that offered it. */
export function useMediaUndo(opts: { inline: boolean }) {
  const deps = useActionDeps()
  const capabilities = useCapabilities()
  const toasts = useToast()
  const { t } = useT()
  const notice = ref<UndoNotice | null>(null)

  function say(messages: RunMessage[], undo?: () => void) {
    if (!messages.length) return
    if (opts.inline) {
      const type = messages.some((m) => m.type === 'error') ? 'error' : (messages[0]?.type ?? 'success')
      notice.value = { type, message: messages.map((m) => m.message).join(' '), ...(undo ? { undo } : {}) }
      return
    }
    for (const { type, message } of messages) {
      if (undo) toasts.push(type, message, { timeout: UNDO_TIMEOUT_MS, action: { label: t('media.trash.undo'), run: undo } })
      else toasts[type](message)
    }
  }

  function offer(message: string, ids: readonly string[], names: ReadonlyMap<string, string>) {
    const undo = ids.length && capabilities.has('restoreMedia') ? () => { void run(ids, names) } : undefined
    say([{ type: 'success', message }], undo)
  }

  async function run(ids: readonly string[], names: ReadonlyMap<string, string>) {
    notice.value = null
    const reported: { report?: BulkReport } = {}
    const r = await runAction(restoreItems, {
      deps, ids, refresh: () => notifyMediaChanged({ restored: ids }), report: (report) => { reported.report = report },
    })
    toastUnexpected(deps, r)
    const report = (r.ok ? r.result : undefined) ?? reported.report
    if (report) say(restoreMessages(t, report, (id) => names.get(id) ?? id))
  }

  function dismiss() { notice.value = null }

  return { notice, offer, dismiss }
}
