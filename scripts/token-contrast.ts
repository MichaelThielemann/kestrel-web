import { fileURLToPath } from 'node:url'
import { compile } from 'sass'

export type Role = 'text' | 'ui' | 'decorative'

export interface Pair {
  name: string
  foreground: string
  background: string
  role: Role
}

export interface Measurement extends Pair {
  theme: string
  foregroundValue: string
  backgroundValue: string
  ratio: number
  threshold: number
  passes: boolean
}

export const THRESHOLDS: Record<Role, number> = { text: 4.5, ui: 3, decorative: 0 }

const TOKENS = fileURLToPath(new URL('../layers/admin/app/assets/scss/_tokens.scss', import.meta.url))

export const PAIRS: Pair[] = [
  { name: 'body text on page', foreground: '--color-text', background: '--color-bg', role: 'text' },
  { name: 'body text on surface', foreground: '--color-text', background: '--color-surface', role: 'text' },
  { name: 'body text on raised surface', foreground: '--color-text', background: '--color-surface-2', role: 'text' },
  { name: 'body text on rail', foreground: '--color-text', background: '--color-rail-bg', role: 'text' },
  { name: 'muted text on page', foreground: '--color-text-muted', background: '--color-bg', role: 'text' },
  { name: 'muted text on surface', foreground: '--color-text-muted', background: '--color-surface', role: 'text' },
  { name: 'muted text on raised surface', foreground: '--color-text-muted', background: '--color-surface-2', role: 'text' },
  { name: 'muted text on rail', foreground: '--color-text-muted', background: '--color-rail-bg', role: 'text' },
  { name: 'link/accent text on page', foreground: '--color-primary-text', background: '--color-bg', role: 'text' },
  { name: 'link/accent text on surface', foreground: '--color-primary-text', background: '--color-surface', role: 'text' },
  { name: 'SERP preview link on surface', foreground: '--color-link', background: '--color-surface', role: 'text' },
  { name: 'danger text on page', foreground: '--color-danger', background: '--color-bg', role: 'text' },
  { name: 'danger text on surface', foreground: '--color-danger', background: '--color-surface', role: 'text' },
  { name: 'warning text on page', foreground: '--color-warning-text', background: '--color-bg', role: 'text' },
  { name: 'warning text on surface', foreground: '--color-warning-text', background: '--color-surface', role: 'text' },
  { name: 'success text on page', foreground: '--color-success', background: '--color-bg', role: 'text' },
  { name: 'success text on surface', foreground: '--color-success', background: '--color-surface', role: 'text' },
  { name: 'primary button label', foreground: '--color-on-primary', background: '--color-primary', role: 'text' },
  { name: 'solid primary label', foreground: '--color-on-primary', background: '--color-primary-solid', role: 'text' },
  { name: 'primary button label (hover)', foreground: '--color-on-primary', background: '--color-primary-hover', role: 'text' },
  { name: 'danger button label', foreground: '--color-on-danger', background: '--color-danger-solid', role: 'text' },
  { name: 'highlighted text', foreground: '--color-on-highlight', background: '--color-highlight', role: 'text' },
  { name: 'selected tab label', foreground: '--color-primary-on-fill', background: '--color-active', role: 'text' },
  { name: 'chip text on page', foreground: '--color-text', background: '--color-primary-soft over --color-bg', role: 'text' },
  { name: 'chip text on surface', foreground: '--color-text', background: '--color-primary-soft over --color-surface', role: 'text' },
  { name: 'badge text (warning) on surface', foreground: '--color-warning-text', background: '--color-surface', role: 'text' },
  { name: 'overlay button label', foreground: '--color-on-overlay', background: '--color-overlay over --color-bg', role: 'text' },
  { name: 'control border on page', foreground: '--color-control-border', background: '--color-bg', role: 'ui' },
  { name: 'control border on surface', foreground: '--color-control-border', background: '--color-surface', role: 'ui' },
  { name: 'strong border on page', foreground: '--color-border-strong', background: '--color-bg', role: 'ui' },
  { name: 'strong border on surface', foreground: '--color-border-strong', background: '--color-surface', role: 'ui' },
  { name: 'chip/selection border on page', foreground: '--color-primary', background: '--color-bg', role: 'ui' },
  { name: 'chip/selection border on surface', foreground: '--color-primary', background: '--color-surface', role: 'ui' },
  { name: 'focus ring on page', foreground: '--color-focus', background: '--color-bg', role: 'ui' },
  { name: 'focus ring on surface', foreground: '--color-focus', background: '--color-surface', role: 'ui' },
  { name: 'focus ring on raised surface', foreground: '--color-focus', background: '--color-surface-2', role: 'ui' },
  { name: 'focus ring on rail', foreground: '--color-focus', background: '--color-rail-bg', role: 'ui' },
  { name: 'focus ring on primary fill', foreground: '--color-focus-on-fill', background: '--color-primary', role: 'ui' },
  { name: 'focus ring on danger fill', foreground: '--color-focus-on-fill', background: '--color-danger-solid', role: 'ui' },
  { name: 'icon/status graphic on page', foreground: '--color-text-subtle', background: '--color-bg', role: 'ui' },
  { name: 'icon/status graphic on surface', foreground: '--color-text-subtle', background: '--color-surface', role: 'ui' },
  { name: 'status dot (danger) on surface', foreground: '--color-danger', background: '--color-surface', role: 'ui' },
  { name: 'separator border on page', foreground: '--color-border', background: '--color-bg', role: 'decorative' },
  { name: 'separator border on surface', foreground: '--color-border', background: '--color-surface', role: 'decorative' },
]

interface Rgba { r: number; g: number; b: number; a: number }

function parseColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const raw = hex[1] ?? ''
    const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (!fn) return null
  const parts = (fn[1] ?? '').split(/[,/]/).map((part) => part.trim()).filter(Boolean)
  const [r, g, b, a] = parts
  if (r === undefined || g === undefined || b === undefined) return null
  return { r: Number(r), g: Number(g), b: Number(b), a: a === undefined ? 1 : Number(a) }
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(color: Rgba): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

export function contrast(foreground: Rgba, background: Rgba): number {
  const front = foreground.a < 1 ? composite(foreground, background) : foreground
  const a = luminance(front)
  const b = luminance(background)
  const [light, dark] = a > b ? [a, b] : [b, a]
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

export function composite(front: Rgba, back: Rgba): Rgba {
  return {
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  }
}

export function readThemes(css: string): Record<string, Record<string, string>> {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const base: Record<string, string> = {}
  const light: Record<string, string> = {}
  const dark: Record<string, string> = {}
  for (const block of blocks) {
    const selector = (block[1] ?? '').trim()
    const target = selector.includes('data-theme=light') ? light : selector.includes('data-theme=dark') ? dark : selector.includes('data-theme]') ? null : base
    if (!target) continue
    for (const declaration of (block[2] ?? '').split(';')) {
      const [name, ...rest] = declaration.split(':')
      const key = (name ?? '').trim()
      if (!key.startsWith('--')) continue
      target[key] = rest.join(':').trim()
    }
  }
  return { light: { ...base, ...light }, dark: { ...base, ...dark } }
}

function resolve(tokens: Record<string, string>, name: string, seen = new Set<string>()): string | null {
  if (seen.has(name)) return null
  seen.add(name)
  const value = tokens[name]
  if (value === undefined) return null
  const reference = /^var\(\s*(--[\w-]+)/.exec(value)
  if (reference) return resolve(tokens, reference[1] ?? '', seen)
  return value
}

function colorOf(tokens: Record<string, string>, expression: string): { value: string; color: Rgba } | null {
  const over = /^(--[\w-]+) over (--[\w-]+)$/.exec(expression)
  if (over) {
    const front = colorOf(tokens, over[1] ?? '')
    const back = colorOf(tokens, over[2] ?? '')
    if (!front || !back) return null
    const mixed = composite(front.color, back.color)
    return { value: `${front.value} over ${back.value}`, color: mixed }
  }
  const raw = resolve(tokens, expression)
  if (raw === null) return null
  const color = parseColor(raw)
  return color ? { value: raw, color } : null
}

export function measure(themes: Record<string, Record<string, string>> = readThemes(compile(TOKENS).css)): Measurement[] {
  const out: Measurement[] = []
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const pair of PAIRS) {
      const foreground = colorOf(tokens, pair.foreground)
      const background = colorOf(tokens, pair.background)
      if (!foreground || !background) throw new Error(`${theme}: unknown token in pair "${pair.name}" (${pair.foreground} on ${pair.background})`)
      const ratio = Math.round(contrast(foreground.color, background.color) * 100) / 100
      const threshold = THRESHOLDS[pair.role]
      out.push({ ...pair, theme, foregroundValue: foreground.value, backgroundValue: background.value, ratio, threshold, passes: ratio >= threshold })
    }
  }
  return out
}

export function markdownTable(measurements: Measurement[]): string {
  const lines = ['| Pair | Foreground | Background | Required | Light | Dark |', '|---|---|---|---|---|---|']
  for (const pair of PAIRS) {
    const light = measurements.find((m) => m.theme === 'light' && m.name === pair.name)
    const dark = measurements.find((m) => m.theme === 'dark' && m.name === pair.name)
    if (!light || !dark) continue
    const required = light.threshold === 0 ? 'decorative' : `${light.threshold}:1`
    const cell = (m: Measurement): string => `${m.foregroundValue} on ${m.backgroundValue} — ${m.ratio.toFixed(2)}:1`
    lines.push(`| ${pair.name} | \`${pair.foreground}\` | \`${pair.background}\` | ${required} | ${cell(light)} | ${cell(dark)} |`)
  }
  return lines.join('\n')
}

export function markdownTableByTheme(measurements: Measurement[]): string {
  const lines = ['| Theme | Pair | Foreground | Background | Ratio | Required | Result |', '|---|---|---|---|---|---|---|']
  for (const m of measurements) {
    const required = m.threshold === 0 ? 'decorative' : `${m.threshold}:1`
    const result = m.threshold === 0 ? '—' : m.passes ? 'pass' : 'FAIL'
    lines.push(`| ${m.theme} | ${m.name} | \`${m.foreground}\` ${m.foregroundValue} | \`${m.background}\` ${m.backgroundValue} | ${m.ratio.toFixed(2)}:1 | ${required} | ${result} |`)
  }
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const measurements = measure()
  console.log(markdownTable(measurements))
  const failed = measurements.filter((m) => !m.passes)
  console.log(`\n${measurements.length} pairs, ${failed.length} below threshold`)
  if (failed.length > 0) process.exitCode = 1
}
