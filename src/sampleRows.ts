import { currencyDigits, currencyPattern, defaultCurrency, type OnDemandColumn, type OnDemandPage, type OnDemandRow, type OnDemandValue } from './onDemand.ts'

// OND-63…OND-68 Live / Sample data of a table page: each person may look at a page with 50 made-up rows instead of its
// real ones (the Data tab, the Insights and the On-Demand Dashboards that read the page), to try charts and filters
// without touching the shared data. The rows are generated from the page's own columns — deterministic for its column
// setup (seeded by the page id and the column definitions), so the same setup gives the same rows and a change of a
// column or its options gives new ones; the dates are relative to the day they are made. A sample page is marked
// (`sample: true`): it is never serialised for Git (serializeOnDemandPage refuses it) and the store refuses every save
// of a page in Sample (useOnDemand). Nothing here reads or writes storage.

export const sampleRowCount = 50
export const samplePrefix = 'SAMPLE'
export const sampleNotice = 'Sample data — nothing is saved'
// CON-102: the reason every change of a page in Sample is disabled with.
export const sampleReason = (name: string) => `Sample data is shown: nothing is saved. Switch ${name} to Live to change it.`
export class SampleWriteError extends Error {
  constructor(name: string) { super(`Sample data is shown for ${name}: nothing is saved to Git. Switch to Live to change it.`); this.name = 'SampleWriteError' }
}

// FNV-1a over the text: the seed of a page's sample.
export function hashText(text: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0 }
  return hash >>> 0
}
// mulberry32: a small deterministic generator (0 ≤ n < 1).
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// The seed text: the page id and every column's id, name, type, options, currency and required — nothing else.
export const sampleSeedText = (page: Pick<OnDemandPage, 'id' | 'columns'>) => JSON.stringify([page.id, page.columns.map((column) => [column.id, column.name, column.type, column.options, column.currency ?? '', column.required])])

const people = ['Alex Morgan (sample)', 'Sam Lee (sample)', 'Robin Park (sample)', 'Kim Novak (sample)', 'Jo Silva (sample)', 'Max Weber (sample)']
const words = ['Supplier', 'Label', 'Batch', 'Packaging', 'Calibration', 'Audit', 'Rework', 'Training', 'Document', 'Inspection', 'Delivery', 'Software', 'Field', 'Process', 'Customer', 'Review']
const tails = ['issue found', 'needs a check', 'late by a week', 'not as specified', 'reported twice', 'under review', 'closed on site', 'waiting for parts', 'fixed in the next lot', 'escalated']
const keyAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const pad = (value: number, size: number) => String(value).padStart(size, '0')
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)
const dayMs = 86_400_000

// A realistic range for a Number column, from its name: money-like, hours / days, counts, a share, else 1–1,000.
export function numberRange(name: string): { min: number; max: number; decimals: number } {
  const text = name.toLowerCase()
  if (/(cost|amount|price|budget|eur|usd|value|spend)/.test(text)) return { min: 100, max: 25_000, decimals: 0 }
  if (/(%|percent|share|rate)/.test(text)) return { min: 0, max: 100, decimals: 1 }
  if (/(hour|hrs|\bh\b|day|week|time|effort|duration)/.test(text)) return { min: 1, max: 80, decimals: 1 }
  if (/(count|qty|quantity|number|#|pieces|units|parts)/.test(text)) return { min: 1, max: 50, decimals: 0 }
  return { min: 1, max: 1_000, decimals: 0 }
}

function valueFor(column: OnDemandColumn, random: () => number, today: number): OnDemandValue | undefined {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  // An optional column is left empty now and then (Multi-select a little more often).
  const empty = !column.required && random() < (column.type === 'multi' ? 0.15 : 0.08)
  switch (column.type) {
    case 'dropdown': return empty || !column.options.length ? undefined : pick(column.options)
    case 'multi': {
      if (empty || !column.options.length) return undefined
      const count = Math.min(column.options.length, 1 + Math.floor(random() * 3))
      const chosen = new Set<string>()
      while (chosen.size < count) chosen.add(pick(column.options))
      return column.options.filter((option) => chosen.has(option))
    }
    case 'number': {
      if (empty) return undefined
      const range = numberRange(column.name)
      const raw = range.min + random() * (range.max - range.min)
      return String(Number(raw.toFixed(range.decimals)))
    }
    case 'currency': {
      if (empty) return undefined
      const code = column.currency && currencyPattern.test(column.currency) ? column.currency : defaultCurrency
      const digits = currencyDigits(code)
      return `${(50 + random() * 19_950).toFixed(digits)} ${code}`
    }
    case 'date': return empty ? undefined : isoDay(today - Math.floor(random() * 365) * dayMs)
    case 'longtext': return empty ? undefined : `${pick(words)} ${pick(tails)}. ${pick(words)} ${pick(tails)} (sample text).`
    default: return empty ? undefined : `${pick(words)} ${pick(tails)}`
  }
}

// OND-64: the 50 sample rows of a page: IDs SAMPLE-0001…SAMPLE-0050 (seq with the page's prefix SAMPLE), keys
// SAMPLE-0000nn-XXXX, added by a made-up person on a day of the last 12 months; every column filled from its type.
// today: the day the dates count back from (UTC midnight of `now`).
export function sampleRows(page: Pick<OnDemandPage, 'id' | 'columns'>, now: Date = new Date()): OnDemandRow[] {
  const random = seededRandom(hashText(sampleSeedText(page)))
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  return Array.from({ length: sampleRowCount }, (_, index) => {
    const seq = index + 1
    const code = Array.from({ length: 4 }, () => keyAlphabet[Math.floor(random() * keyAlphabet.length)]).join('')
    const added = today - Math.floor(random() * 365) * dayMs + Math.floor(random() * 9 + 8) * 3_600_000
    const cells: Record<string, OnDemandValue> = {}
    for (const column of page.columns) { const value = valueFor(column, random, today); if (value !== undefined) cells[column.id] = value }
    return { id: `sample-${pad(seq, 4)}`, key: `${samplePrefix}-${pad(seq, 6)}-${code}`, seq, addedBy: people[Math.floor(random() * people.length)], addedAt: new Date(added).toISOString(), cells }
  })
}

// The page as shown in Sample: its columns, charts, colours and filter row, with the sample rows instead of its own.
// Cached by the seed and the day, so the rows keep their identity between renders.
const cache = new Map<string, OnDemandRow[]>()
export function samplePage(page: OnDemandPage, now: Date = new Date()): OnDemandPage {
  if (page.sample) return page
  const key = `${now.toISOString().slice(0, 10)}|${sampleSeedText(page)}`
  let rows = cache.get(key)
  if (!rows) { rows = sampleRows(page, now); cache.set(key, rows); if (cache.size > 40) cache.delete(cache.keys().next().value as string) }
  const out: OnDemandPage = { ...page, keyPrefix: samplePrefix, rows, sample: true }
  delete out.storage
  delete out.lastSeq
  return out
}
export const isSamplePage = (page: Pick<OnDemandPage, 'sample'> | null | undefined) => Boolean(page?.sample)
// OND-67: an export of sample rows — the file name starts with "Sample-" and the first line says "Sample data".
export const sampleFileName = (name: string, sample: boolean) => sample ? `Sample-${name}` : name
