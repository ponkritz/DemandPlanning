import { additive, narrativeAutoKeys, type Insight, type Narrative, type NarrativeAuto, type NarrativeGrain, type NarrativeMetric, type NarrativeOp, type NarrativeRule, type NarrativeTone, type OnDemandPage } from './onDemand.ts'
import { aggregate, bucketsOf, formatValue, kpiData, measureText, noneKey, otherKey, periodOf, type InsightData } from './onDemandInsights.ts'

// CHT-60…CHT-69 Narratives: the sentences of a Narrative insight or Dashboard block, computed from the rows it counts
// (the filter row or the dashboard's period and filters, then its own filters, as a chart), deterministic, in the
// browser, without AI or any request. Automatic sentences first, in a fixed order, then the owners' rules in their
// order. Kept free of React so that every rule is tested on its own (tests/narratives.test.mjs).

export const autoLabels: Record<NarrativeAuto, { label: string; hint: string }> = {
  total: { label: 'Total', hint: 'The measure over every row counted, and how many rows.' },
  top: { label: 'Highest category', hint: 'The Group by value with the largest measure and its share of the total.' },
  bottom: { label: 'Lowest category', hint: 'The Group by value with the smallest measure and its share of the total.' },
  change: { label: 'Change vs the previous period', hint: 'The latest period of the Date column against the one before (month, quarter or year).' },
  threshold: { label: 'Above / below a threshold', hint: 'How many Group by values are above (or below) a number — or whether the total is.' },
  mover: { label: 'Biggest mover', hint: 'The Group by value that changed most between the previous and the latest period.' },
}
// The If list of a rule (short), and the words of ⓘ.
export const metricLabels: Record<NarrativeMetric, string> = { total: 'Total', count: 'Rows counted', top_value: 'Top value', share: 'Top share (%)', change: 'Change (%)', top: 'Top category' }
const metricWords: Record<NarrativeMetric, string> = { total: 'the measure (total)', count: 'the rows counted', top_value: 'the top category’s value', share: 'the top category’s share (%)', change: 'the change vs the previous period (%)', top: 'the top category' }
export const opLabels: Record<NarrativeOp, string> = { gt: '>', ge: '≥', lt: '<', le: '≤', eq: '=', changed: 'changed by more than (%)', is_top: 'is top category' }
export const toneLabels: Record<NarrativeTone, string> = { info: 'Info', good: 'Good', warning: 'Warning', bad: 'Bad' }
export const grainLabels: Record<NarrativeGrain, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' }

export interface NarrativeLine { tone: NarrativeTone; text: string; from: 'auto' | 'rule' | 'else' }
interface Ranked { label: string; value: number; share?: number }
export interface NarrativeFacts {
  total: number | null; count: number; currency: string; currencies: { code: string; rows: number }[]
  category: string // the Group by column's name ('' without one)
  ranked: Ranked[] // the Group by values with a number, largest first ("(none)" left out)
  current?: { key: string; label: string; value: number | null } // the latest period with rows
  previous?: { key: string; label: string; value: number | null } // the one before it (value null: no rows there)
  change: number | null // % against the previous period (null: nothing to compare, or it was 0)
  mover?: { label: string; diff: number; percent: number | null }
}

// ---- numbers as the measure shows them (OND-24: a Currency measure with its code) ----
export const formatAmount = (value: number | null | undefined, currency = '') => value == null ? '—' : `${formatValue(value)}${currency ? ` ${currency}` : ''}`
export const formatPercent = (value: number | null | undefined) => value == null ? '—' : `${Number(value.toFixed(1)).toLocaleString('en')}%`
export const formatChange = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatPercent(Math.abs(value))}`

// The period before a period's key (month YYYY-MM, quarter YYYY-Qn, year YYYY) — the day before its first day.
export function periodBefore(key: string, grain: NarrativeGrain): { key: string; label: string } {
  const year = Number(key.slice(0, 4))
  const first = grain === 'year' ? `${year}-01-01` : grain === 'quarter' ? `${year}-${String((Number(key.slice(6)) - 1) * 3 + 1).padStart(2, '0')}-01` : `${key}-01`
  const before = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  return periodOf(before, grain)
}

const probe = (insight: Insight, category: string, grain: NarrativeGrain = 'month'): Insight => ({ ...insight, type: 'table', category, second: '', sort: 'value', options: grain === 'month' ? undefined : { dateGroup: grain } })
// The measure per category; a Currency measure only in the currency wanted (another currency: no number, never mixed).
function byCategory(page: OnDemandPage, insight: Insight, category: string, currency: string, grain?: NarrativeGrain): Map<string, { label: string; value: number | null }> {
  const data: InsightData = aggregate(page, probe(insight, category, grain), { currency })
  const out = new Map<string, { label: string; value: number | null }>()
  if (currency && data.currency && data.currency !== currency) return out
  data.categories.forEach((bucket, index) => { if (bucket.key !== noneKey && bucket.key !== otherKey) out.set(bucket.key, { label: bucket.label, value: data.categoryTotals[index] }) })
  return out
}
const rowsIn = (page: OnDemandPage, column: string, grain: NarrativeGrain, key: string): OnDemandPage => {
  const date = page.columns.find((entry) => entry.id === column)
  return { ...page, rows: date ? page.rows.filter((row) => bucketsOf(date, row.cells[date.id], grain)[0]?.key === key) : [] }
}

// The facts the sentences and rules read. compare: the rows for the previous period — those of the filter row (or the
// dashboard's filters) without its period, so that "vs Q3" can be said while Q4 is chosen; the rows shown when absent.
export function narrativeFacts(page: OnDemandPage, insight: Insight, { compare, currency: wanted = '' }: { compare?: OnDemandPage; currency?: string } = {}): NarrativeFacts {
  const narrative = insight.narrative ?? { auto: [], rules: [] }
  const kpi = kpiData(page, insight, wanted)
  const currency = kpi.currency
  const group = insight.category ? page.columns.find((column) => column.id === insight.category) : undefined
  const grain = narrative.grain ?? 'month'
  const facts: NarrativeFacts = { total: kpi.total, count: kpi.rows.used, currency, currencies: kpi.currencies, category: group?.name ?? '', ranked: [], change: null }
  if (group) {
    const values = [...byCategory(page, insight, group.id, currency, group.type === 'date' ? grain : undefined).values()].filter((entry): entry is Ranked => entry.value != null)
    values.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
    const shares = additive(insight.measure) && kpi.total ? kpi.total : 0
    facts.ranked = values.map((entry) => shares ? { ...entry, share: entry.value / shares * 100 } : entry)
  }
  const period = narrative.period ? page.columns.find((column) => column.id === narrative.period && column.type === 'date') : undefined
  if (period) {
    const shown = byCategory(page, insight, period.id, currency, grain)
    const keys = [...shown.keys()].sort()
    const last = keys.at(-1)
    if (last) {
      const before = periodBefore(last, grain)
      const base = compare ?? page
      const earlier = byCategory(base, insight, period.id, currency, grain).get(before.key)
      facts.current = { key: last, label: shown.get(last)!.label, value: shown.get(last)!.value }
      facts.previous = { key: before.key, label: before.label, value: earlier?.value ?? null }
      const now = facts.current.value, then = facts.previous.value
      facts.change = now != null && then != null && then !== 0 ? (now - then) / Math.abs(then) * 100 : null
      if (group) {
        const latest = byCategory(rowsIn(page, period.id, grain, last), insight, group.id, currency, group.type === 'date' ? grain : undefined)
        const prior = byCategory(rowsIn(base, period.id, grain, before.key), insight, group.id, currency, group.type === 'date' ? grain : undefined)
        if (prior.size) {
          let best: NarrativeFacts['mover']
          for (const key of new Set([...latest.keys(), ...prior.keys()])) {
            const a = latest.get(key)?.value ?? 0, b = prior.get(key)?.value ?? 0
            const diff = a - b
            const label = latest.get(key)?.label ?? prior.get(key)!.label
            if (diff !== 0 && (!best || Math.abs(diff) > Math.abs(best.diff) || Math.abs(diff) === Math.abs(best.diff) && label.localeCompare(best.label) < 0)) best = { label, diff, percent: b ? diff / Math.abs(b) * 100 : null }
          }
          facts.mover = best
        }
      }
    }
  }
  return facts
}

// The value a rule's metric compares (and shows as {value}).
function metricValue(facts: NarrativeFacts, metric: NarrativeMetric): number | null {
  if (metric === 'total') return facts.total
  if (metric === 'count') return facts.count
  if (metric === 'top_value') return facts.ranked[0]?.value ?? null
  if (metric === 'share') return facts.ranked[0]?.share ?? null
  if (metric === 'change') return facts.change
  return null
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
// CHT-63: does a rule match — a comparison of a number (no number: never), "changed by more than x%" on the size of the
// change, "is top category" on the name (any case).
export function ruleMatches(rule: NarrativeRule, facts: NarrativeFacts): boolean {
  if (rule.op === 'is_top') return Boolean(facts.ranked[0]) && facts.ranked[0].label.toLowerCase() === String(rule.value).trim().toLowerCase()
  const limit = Number(rule.value)
  if (!Number.isFinite(limit)) return false
  if (rule.op === 'changed') return facts.change != null && Math.abs(facts.change) > Math.abs(limit)
  const value = metricValue(facts, rule.metric)
  if (value == null) return false
  if (rule.op === 'gt') return value > limit && !near(value, limit)
  if (rule.op === 'ge') return value >= limit || near(value, limit)
  if (rule.op === 'lt') return value < limit && !near(value, limit)
  if (rule.op === 'le') return value <= limit || near(value, limit)
  return near(value, limit)
}
// CHT-64: the placeholders of a template, each replaced by text (one pass: a value holding "{total}" stays as it is).
export function placeholderValues(facts: NarrativeFacts, rule?: Pick<NarrativeRule, 'metric' | 'op'>): Record<string, string> {
  const amount = (value: number | null | undefined) => formatAmount(value, facts.currency)
  const top = facts.ranked[0]
  const compared = !rule ? amount(facts.total) : rule.op === 'is_top' ? top?.label ?? '—' : rule.op === 'changed' || rule.metric === 'change' ? formatChange(facts.change)
    : rule.metric === 'share' ? formatPercent(top?.share) : rule.metric === 'count' ? formatValue(facts.count) : rule.metric === 'top_value' ? amount(top?.value) : amount(facts.total)
  return { value: compared, total: amount(facts.total), top: top?.label ?? '—', top_value: amount(top?.value), share: formatPercent(top?.share), change: formatChange(facts.change), period: facts.current?.label ?? '—', count: formatValue(facts.count), category: facts.category || '—' }
}
export const fillTemplate = (template: string, values: Record<string, string>) => template.replace(/\{([a-z_]+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? values[key] : match)

// ---- the automatic sentences (CHT-61, CHT-62) ----
const rowsWord = (count: number) => `${formatValue(count)} row${count === 1 ? '' : 's'}`
function autoSentence(key: NarrativeAuto, page: OnDemandPage, insight: Insight, facts: NarrativeFacts): string {
  const amount = (value: number | null | undefined) => formatAmount(value, facts.currency)
  const narrative = insight.narrative!
  const measure = measureText(page, insight)
  if (key === 'total') return insight.measure === 'count' ? `${rowsWord(facts.count)} counted.` : `${measure}: ${amount(facts.total)} across ${rowsWord(facts.count)}.`
  if (key === 'top' || key === 'bottom') {
    if (!facts.ranked.length) return ''
    if (key === 'bottom' && facts.ranked.length < 2) return ''
    const entry = key === 'top' ? facts.ranked[0] : facts.ranked[facts.ranked.length - 1]
    return `${key === 'top' ? 'Highest' : 'Lowest'} ${facts.category}: ${entry.label} with ${amount(entry.value)}${entry.share != null ? ` (${formatPercent(entry.share)} of the total)` : ''}.`
  }
  if (key === 'change') {
    if (!facts.current || !facts.previous) return ''
    const { current, previous } = facts
    if (previous.value == null) return `${current.label}: ${amount(current.value)}; nothing in ${previous.label} to compare with.`
    if (previous.value === 0) return `${current.label}: ${amount(current.value)}, up from 0 in ${previous.label}.`
    const change = facts.change ?? 0
    return `${current.label}: ${amount(current.value)}, ${near(change, 0) ? 'unchanged' : `${change > 0 ? 'up' : 'down'} ${formatPercent(Math.abs(change))}`} vs ${previous.label} (${amount(previous.value)}).`
  }
  if (key === 'threshold') {
    const threshold = narrative.threshold
    if (!threshold) return ''
    const word = threshold.op === 'above' ? 'above' : 'below'
    const passes = (value: number) => threshold.op === 'above' ? value > threshold.value && !near(value, threshold.value) : value < threshold.value && !near(value, threshold.value)
    if (!insight.category) return facts.total == null ? '' : `${measure}, ${amount(facts.total)}, is ${passes(facts.total) ? '' : 'not '}${word} ${amount(threshold.value)}.`
    const hits = facts.ranked.filter((entry) => passes(entry.value))
    const names = hits.slice(0, 5).map((entry) => entry.label).join(', ') + (hits.length > 5 ? ` and ${hits.length - 5} more` : '')
    return `${hits.length} of ${facts.ranked.length} ${facts.category} values ${word} ${amount(threshold.value)}${hits.length ? `: ${names}` : ''}.`
  }
  // mover
  if (!facts.mover || !facts.current || !facts.previous) return ''
  const { mover } = facts
  return `Biggest mover from ${facts.previous.label} to ${facts.current.label}: ${mover.label}, ${mover.diff > 0 ? 'up' : 'down'} ${amount(Math.abs(mover.diff))}${mover.percent != null ? ` (${formatChange(mover.percent)})` : ''}.`
}

// CHT-60…CHT-65: the lines of a Narrative — none when no row is counted ("Nothing to report for this selection.").
export function narrativeLines(page: OnDemandPage, insight: Insight, options: { compare?: OnDemandPage; currency?: string } = {}): { lines: NarrativeLine[]; facts: NarrativeFacts } {
  const facts = narrativeFacts(page, insight, options)
  const narrative: Narrative = insight.narrative ?? { auto: [], rules: [] }
  if (!facts.count) return { lines: [], facts }
  const lines: NarrativeLine[] = narrativeAutoKeys.filter((key) => narrative.auto.includes(key)).flatMap((key) => { const text = autoSentence(key, page, insight, facts); return text ? [{ tone: 'info' as const, text, from: 'auto' as const }] : [] })
  let matched = false
  for (const rule of narrative.rules) {
    if (!ruleMatches(rule, facts)) continue
    matched = true
    lines.push({ tone: rule.tone, text: fillTemplate(rule.template, placeholderValues(facts, rule)), from: 'rule' })
    if (narrative.mode === 'first') break
  }
  if (!matched && narrative.otherwise) lines.push({ tone: 'info', text: fillTemplate(narrative.otherwise, placeholderValues(facts)), from: 'else' })
  return { lines, facts }
}

// CHT-65: what ⓘ says of a Narrative — its sentences, its rules in words, the mode and how the numbers are counted.
export function ruleText(rule: NarrativeRule, page: OnDemandPage, insight: Insight): string {
  const what = rule.op === 'changed' ? `${measureText(page, insight)} changed by more than ${formatPercent(Number(rule.value))} vs the previous period`
    : rule.op === 'is_top' ? `the top category is “${rule.value}”` : `${rule.metric === 'total' ? measureText(page, insight) : metricWords[rule.metric]} ${opLabels[rule.op]} ${formatValue(Number(rule.value))}`
  return `If ${what}: “${rule.template}” (${toneLabels[rule.tone]})`
}
export function narrativeInfo(page: OnDemandPage, insight: Insight): string[] {
  const narrative = insight.narrative ?? { auto: [], rules: [] }
  const period = page.columns.find((column) => column.id === narrative.period)
  const lines = [
    `Sentences: ${narrative.auto.length ? narrativeAutoKeys.filter((key) => narrative.auto.includes(key)).map((key) => autoLabels[key].label).join(', ') : 'none'}${period ? `; the period: ${grainLabels[narrative.grain ?? 'month'].toLowerCase()} of ${period.name}` : ''}${narrative.threshold && narrative.auto.includes('threshold') ? `; the threshold: ${narrative.threshold.op} ${formatValue(narrative.threshold.value)}` : ''}.`,
    ...narrative.rules.map((rule, index) => `Rule ${index + 1}. ${ruleText(rule, page, insight)}.`),
    narrative.rules.length ? narrative.mode === 'first' ? 'Only the first rule that matches is shown.' : 'Every rule that matches is shown, in this order.' : '',
    narrative.otherwise ? `When no rule matches: “${narrative.otherwise}”.` : '',
    'Highest and lowest leave “(none)” out. The previous period is counted with the same filters, outside the period chosen above. A Currency measure is one currency at a time, never converted.',
    'Computed in the browser from the rows shown; plain text — the placeholders are replaced by the numbers, nothing else is read.',
  ]
  return lines.filter(Boolean)
}
