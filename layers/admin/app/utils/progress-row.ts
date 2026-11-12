import type { IconName } from './icons'

/** Tone of a `KestrelUiProgressRow` and of its status. */
export type ProgressRowTone = 'default' | 'muted' | 'success' | 'danger'

/** The status a `KestrelUiProgressRow` shows as icon and text. */
export interface ProgressRowStatus {
  text: string
  icon?: IconName
  tone?: ProgressRowTone
  /** Shows the kit spinner in place of the icon. */
  busy?: boolean
}

/** The thin bar of a `KestrelUiProgressRow`. */
export interface ProgressRowProgress {
  /** Percent, 0–100; leave it out for an indeterminate bar. */
  value?: number
  label: string
  valueText?: string
  tone?: 'default' | 'success' | 'danger'
}
