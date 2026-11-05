// Personal views (MYD-06…MYD-09): what each person changes about their own pages — the sections of a page (shown,
// hidden and their order), the menu (pinned and hidden pages) and the filters each page remembers. Kept in the Git
// data repository per person (personal-views/<email>.json), so it follows them to every computer; an admin's layout
// can be saved as the default for everyone (personal-views-defaults.json). Read from Git like any other input: only
// known shapes are kept.
export interface SectionLayout { order: string[]; hidden: string[] }
export interface MenuLayout { pinned: string[]; hidden: string[] }
export interface PersonalViews { schema: 1; kind: 'personal-views'; sections: Record<string, SectionLayout>; menu: MenuLayout; filters: Record<string, unknown> }
const kind = 'personal-views'
export const viewsDefaultsPath = 'personal-views-defaults.json'
export const emptyViews = (): PersonalViews => ({ schema: 1, kind, sections: {}, menu: { pinned: [], hidden: [] }, filters: {} })

export function personalViewsPath(email: string) {
  const value = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `personal-views/${value.replace(/[^a-z0-9._@+-]/g, '_').replace(/\.{2,}/g, '_')}.json` : ''
}

const ids = (value: unknown, max = 200) => Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && /^[\w:.-]{1,80}$/.test(entry)))].slice(0, max) : []
const keyOk = (key: string) => /^[\w:.-]{1,80}$/.test(key)
// A filter is kept as plain JSON of limited size; each page checks its own shape when it reads it.
const plain = (value: unknown) => { try { const text = JSON.stringify(value); return text != null && text.length <= 20000 ? JSON.parse(text) as unknown : undefined } catch { return undefined } }

export function parseViews(text: string | null | undefined): PersonalViews {
  if (!text) return emptyViews()
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return emptyViews() }
  const input = raw as Partial<Record<keyof PersonalViews, unknown>> | null
  if (!input || typeof input !== 'object' || input.schema !== 1 || input.kind !== kind) return emptyViews()
  const sections: Record<string, SectionLayout> = {}
  if (input.sections && typeof input.sections === 'object') for (const [page, layout] of Object.entries(input.sections as Record<string, { order?: unknown; hidden?: unknown }>)) if (keyOk(page) && layout && typeof layout === 'object') sections[page] = { order: ids(layout.order), hidden: ids(layout.hidden) }
  const menu = input.menu && typeof input.menu === 'object' ? input.menu as { pinned?: unknown; hidden?: unknown } : {}
  const filters: Record<string, unknown> = {}
  if (input.filters && typeof input.filters === 'object') for (const [page, value] of Object.entries(input.filters as Record<string, unknown>)) { const kept = keyOk(page) ? plain(value) : undefined; if (kept !== undefined) filters[page] = kept }
  return { schema: 1, kind, sections, menu: { pinned: ids(menu.pinned), hidden: ids(menu.hidden) }, filters }
}
export const serializeViews = (views: PersonalViews) => `${JSON.stringify({ schema: 1, kind, sections: views.sections, menu: views.menu, filters: views.filters }, null, 2)}\n`

// My views over the defaults: a page I changed keeps my layout, any other page uses the default one; the same for
// the menu (when I set nothing) and each page's filters.
export function withDefaults(mine: PersonalViews, defaults: PersonalViews): PersonalViews {
  const menuSet = mine.menu.pinned.length || mine.menu.hidden.length
  return { schema: 1, kind, sections: { ...defaults.sections, ...mine.sections }, menu: menuSet ? mine.menu : defaults.menu, filters: { ...defaults.filters, ...mine.filters } }
}

// The sections of a page in the person's order: their saved order first (sections that no longer exist dropped), new
// sections where the page lists them, after the ones before them; hidden ones apart.
export function arrangeSections(available: string[], layout: SectionLayout | undefined) {
  const order = (layout?.order ?? []).filter((id) => available.includes(id))
  for (const [index, id] of available.entries()) {
    if (order.includes(id)) continue
    const before = available.slice(0, index).reverse().find((entry) => order.includes(entry))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  }
  const hidden = new Set(layout?.hidden ?? [])
  return { order, shown: order.filter((id) => !hidden.has(id)), hidden: order.filter((id) => hidden.has(id)) }
}
export const moveSection = (order: string[], id: string, by: -1 | 1) => { const from = order.indexOf(id), to = from + by; if (from < 0 || to < 0 || to >= order.length) return order; const next = [...order]; next.splice(from, 1); next.splice(to, 0, id); return next }
