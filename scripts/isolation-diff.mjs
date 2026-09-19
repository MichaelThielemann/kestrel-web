import { createRequire } from 'node:module'

const PROPS = [
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-style', 'font-variant',
  'word-spacing', 'text-indent', 'text-shadow', 'hyphens', 'color', 'background-color', 'background-image',
  'opacity', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-radius',
  'box-shadow', 'outline-width', 'outline-style', 'outline-color', 'outline-offset',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'box-sizing', 'display', 'gap', 'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness',
  'text-transform', 'text-align', 'white-space', 'vertical-align', 'list-style-type', 'list-style-position',
  'cursor', 'accent-color', 'caret-color', 'scroll-behavior', 'visibility',
  'width', 'height', 'min-height', 'max-width', 'appearance', '-webkit-text-fill-color',
]

const PSEUDO_PROPS = ['color', 'background-color', 'font-size', 'content', 'display']

const ROUTES = ['/admin', '/admin/pages', '/admin/media', '/admin/references', '/admin/users', '/admin/system', '/admin/insights']

const OVERLAYS = [
  { route: '/admin', name: 'account-menu', trigger: '.rail-account__trigger', settle: '.rail-account__menu' },
  { route: '/admin/users', name: 'row-menu', trigger: '.ui-table__actions button', settle: '.ui-menu' },
  { route: '/admin/users', name: 'new-user-dialog', trigger: '.list__head button', settle: '.ui-dialog__content' },
  { route: '/admin/media', name: 'upload-menu', trigger: '.media-toolbar__actions button', settle: '.ui-dialog__content' },
]

const STRAY_ROLES = ['dialog', 'alertdialog', 'menu', 'listbox', 'tooltip', 'grid']

function collectStrays(roles) {
  const out = []
  const looksLikeUi = (el) => roles.includes(el.getAttribute('role') ?? '')
    || [...el.attributes].some((a) => a.name.startsWith('data-reka-'))
    || [...el.classList].some((name) => name.startsWith('ui-') || name.startsWith('rail-'))
  for (const el of document.body.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
    if (el.closest('.admin, .admin-portal')) continue
    if (!looksLikeUi(el)) continue
    const cls = (el.getAttribute('class') || '').trim()
    out.push(cls ? `${el.tagName.toLowerCase()}.${cls.split(/\s+/).sort().join('.')}` : `${el.tagName.toLowerCase()}[role=${el.getAttribute('role')}]`)
  }
  return [...new Set(out)]
}

function collect([props, pseudoProps]) {
  const out = {}
  const push = (key, prop, value) => {
    out[key] ??= {}
    out[key][prop] ??= []
    if (!out[key][prop].includes(value)) out[key][prop].push(value)
  }
  const classKey = (el) => {
    const cls = (el.getAttribute('class') || '').trim()
    return cls ? `${el.tagName.toLowerCase()}.${cls.split(/\s+/).sort().join('.')}` : el.tagName.toLowerCase()
  }
  const keyOf = (el) => {
    const parts = []
    let node = el
    let depth = 0
    while (node && depth < 4) {
      parts.unshift(classKey(node))
      if (node.classList.contains('admin') || node.classList.contains('admin-portal')) break
      node = node.parentElement
      depth += 1
    }
    return parts.join('>')
  }
  const seen = new Set()
  const elements = []
  for (const root of document.querySelectorAll('.admin, .admin-portal')) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (seen.has(el) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      seen.add(el)
      elements.push(el)
    }
  }
  const freeze = document.createElement('style')
  freeze.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'
  document.head.appendChild(freeze)
  void document.body.offsetHeight
  for (const el of elements) {
    const key = keyOf(el)
    const cs = getComputedStyle(el)
    for (const prop of props) push(key, prop, cs.getPropertyValue(prop))
    for (const pseudo of ['::before', '::after', '::placeholder', '::selection', '::marker']) {
      const pcs = getComputedStyle(el, pseudo)
      if (!pcs) continue
      for (const prop of pseudoProps) push(key, `${pseudo}|${prop}`, pcs.getPropertyValue(prop))
    }
  }
  const doc = {}
  for (const prop of ['font-size', 'scroll-behavior', 'letter-spacing', 'color-scheme']) {
    doc[`html|${prop}`] = getComputedStyle(document.documentElement).getPropertyValue(prop)
  }
  doc['html|data-theme'] = document.documentElement.getAttribute('data-theme') || ''
  freeze.remove()
  return { elements: out, doc }
}

async function snapshot(chromium, base, theme, user, password) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', () => {})
  await page.goto(`${base}/admin/login`, { waitUntil: 'networkidle' })
  const inputs = page.locator('.admin input')
  if (await inputs.count() >= 2) {
    await inputs.nth(0).fill(user)
    await inputs.nth(1).fill(password)
    await page.locator('.admin button[type=submit]').click()
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  const views = {}
  const strays = {}
  for (const route of ['/admin/login', ...ROUTES]) {
    await page.goto(base + route, { waitUntil: 'networkidle' }).catch(() => {})
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
    await page.waitForTimeout(400)
    views[route] = await page.evaluate(collect, [PROPS, PSEUDO_PROPS]).catch(() => null)
    strays[route] = await page.evaluate(collectStrays, STRAY_ROLES).catch(() => [])

    for (const overlay of OVERLAYS.filter((o) => o.route === route)) {
      const key = `${route}#${overlay.name}`
      const opened = await page.locator(overlay.trigger).first().click({ timeout: 4000 })
        .then(() => page.locator(overlay.settle).first().waitFor({ state: 'visible', timeout: 4000 }))
        .then(() => true)
        .catch(() => false)
      if (!opened) { console.error(`  overlay ${key} did not open on ${base}`); continue }
      await page.waitForTimeout(300)
      views[key] = await page.evaluate(collect, [PROPS, PSEUDO_PROPS]).catch(() => null)
      strays[key] = await page.evaluate(collectStrays, STRAY_ROLES).catch(() => [])
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(200)
    }
  }
  await browser.close()
  return { views, strays }
}

const [baseline, consumer] = process.argv.slice(2)
if (!baseline || !consumer) {
  console.error('usage: node scripts/isolation-diff.mjs <baseline-url> <consumer-url>')
  process.exit(2)
}

const playwright = process.env.PLAYWRIGHT_CORE ?? 'playwright-core'
const { chromium } = await import(playwright).catch(() => createRequire(import.meta.url)(playwright))

const rows = []
const docRows = []
const strayRows = []
for (const theme of ['light', 'dark']) {
  const baseSnapshot = await snapshot(chromium, baseline, theme, process.env.ADMIN_USER ?? 'admin', process.env.ADMIN_PASSWORD ?? 'change-me')
  const consSnapshot = await snapshot(chromium, consumer, theme, process.env.ADMIN_USER ?? 'admin', process.env.ADMIN_PASSWORD ?? 'change-me')
  const base = baseSnapshot.views
  const cons = consSnapshot.views
  for (const [route, keys] of Object.entries(consSnapshot.strays)) {
    for (const key of keys) strayRows.push({ theme, route, key })
  }
  for (const [route, keys] of Object.entries(baseSnapshot.strays)) {
    for (const key of keys) strayRows.push({ theme, route: `${route} (baseline)`, key })
  }
  for (const route of Object.keys(base)) {
    if (!base[route] || !cons[route]) continue
    for (const [key, properties] of Object.entries(base[route].elements)) {
      const other = cons[route].elements[key]
      if (!other) continue
      for (const [prop, values] of Object.entries(properties)) {
        const extra = (other[prop] ?? []).filter((value) => !values.includes(value))
        if (extra.length) rows.push({ theme, route, key, prop, baseline: values.join(' | '), consumer: extra.join(' | ') })
      }
    }
    for (const [key, value] of Object.entries(base[route].doc)) {
      if (cons[route].doc[key] !== value) docRows.push({ theme, key, baseline: value, consumer: cons[route].doc[key] })
    }
  }
}

const unique = new Map()
for (const row of rows) unique.set(JSON.stringify([row.key, row.prop, row.consumer]), row)
const geometry = /^(width|height|min-|max-|margin)/

const byProp = {}
for (const row of unique.values()) byProp[row.prop] = (byProp[row.prop] ?? 0) + 1

console.log(`baseline ${baseline}\nconsumer ${consumer}\n`)
for (const [prop, count] of Object.entries(byProp).sort((a, b) => b[1] - a[1])) {
  console.log(String(count).padStart(6), prop)
}
const styleLeaks = [...unique.values()].filter((row) => !geometry.test(row.prop))
console.log(`\ntotal ${unique.size}  style leaks (excluding geometry) ${styleLeaks.length}`)
for (const row of styleLeaks.slice(0, 40)) {
  console.log(` [${row.prop}] ${row.key}\n   baseline: ${row.baseline.slice(0, 100)}\n   consumer: ${row.consumer.slice(0, 100)}`)
}
const uniqueDoc = new Map(docRows.map((row) => [JSON.stringify([row.key, row.consumer]), row]))
if (uniqueDoc.size) {
  console.log('\ndocument root:')
  for (const row of uniqueDoc.values()) console.log(` ${row.key}: baseline "${row.baseline}" consumer "${row.consumer}"`)
}

const uniqueStrays = new Map(strayRows.map((row) => [JSON.stringify([row.route, row.key]), row]))
console.log(`\nunscoped body elements ${uniqueStrays.size}`)
for (const row of uniqueStrays.values()) console.log(` ${row.route}: ${row.key}`)

process.exit(styleLeaks.length === 0 && uniqueStrays.size === 0 ? 0 : 1)
