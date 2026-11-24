import { cleanOptions, insightKindOf, maxNarrativeRules, maxTemplate, narrativeAutoKeys, narrativeGrains, narrativePlaceholders, narrativeToneKeys, type Insight, type Narrative, type NarrativeAuto, type NarrativeGrain, type NarrativeMetric, type NarrativeOp, type NarrativeRule, type NarrativeTone, type OnDemandPage } from '../onDemand'
import { categoryColumns } from '../onDemandInsights'
import { autoLabels, grainLabels, metricLabels, opLabels, toneLabels } from '../narratives'
import { factoryOf, sizeFromOptions, withSizeOptions } from '../chartSize'
import { SizeFields } from './ChartSize'
import { Info } from './ui'

// CHT-66 The Narrative part of the chart pop-up (Insights) and the block pop-up (Dashboard) — Group by on the Data tab,
// the rest on the Narrative tab (CHT-70): Group by, the period's
// Date column and length, the automatic sentences to show, the threshold, the rules (add, edit, ↑ ↓, remove; at most
// 20), every rule or the first that matches, the Else sentence and the width. The measure, its column and the filters
// are the pop-up's own fields, as for a chart. onChange gets the whole insight.
const metricOrder: NarrativeMetric[] = ['total', 'count', 'top_value', 'share', 'change', 'top']
const opsFor = (metric: NarrativeMetric): NarrativeOp[] => metric === 'top' ? ['is_top'] : metric === 'change' ? ['gt', 'ge', 'lt', 'le', 'eq', 'changed'] : ['gt', 'ge', 'lt', 'le', 'eq']
const blankRule = (): NarrativeRule => ({ metric: 'total', op: 'gt', value: '', template: '', tone: 'info' })

export function NarrativeFields({ page, insight, onChange, part }: { page: OnDemandPage; insight: Insight; onChange: (next: Insight) => void; part: 'data' | 'narrative' }) {
  const narrative: Narrative = insight.narrative ?? { auto: [], rules: [] }
  const set = (change: Partial<Narrative>) => onChange({ ...insight, narrative: { ...narrative, ...change } })
  const groups = categoryColumns(page, 'narrative')
  const dates = page.columns.filter((column) => column.type === 'date')
  const hasGroup = Boolean(insight.category), hasPeriod = Boolean(narrative.period)
  const needs = (key: NarrativeAuto) => (key === 'top' || key === 'bottom') && !hasGroup ? 'Needs a Group by column.' : key === 'change' && !hasPeriod ? 'Needs the period’s Date column.' : key === 'mover' && (!hasGroup || !hasPeriod) ? 'Needs a Group by column and the period’s Date column.' : ''
  const tick = (key: NarrativeAuto, on: boolean) => set({ auto: narrativeAutoKeys.filter((entry) => entry === key ? on : narrative.auto.includes(entry)), ...(key === 'threshold' && on && !narrative.threshold ? { threshold: { op: 'above' as const, value: 0 } } : {}) })
  const setRule = (index: number, change: Partial<NarrativeRule>) => set({ rules: narrative.rules.map((rule, at) => at === index ? { ...rule, ...change } : rule) })
  const moveRule = (index: number, by: number) => { const to = index + by; if (to < 0 || to >= narrative.rules.length) return; const rules = [...narrative.rules];[rules[index], rules[to]] = [rules[to], rules[index]]; set({ rules }) }
  const kind = insightKindOf('narrative')
  const options = insight.options ?? {}
  const size = { ...factoryOf(kind), ...sizeFromOptions(options, kind) }
  const addReason = narrative.rules.length >= maxNarrativeRules ? `At most ${maxNarrativeRules} rules.` : ''
  // CHT-70: Group by is on the Data tab; the period, the sentences, the rules and the width on the Narrative tab.
  if (part === 'data') return <label>Group by (optional)
    <select aria-label="Group by" value={insight.category} onChange={(event) => onChange({ ...insight, category: event.target.value })}>
      <option value="">— None —</option>
      {insight.category && !groups.some((column) => column.id === insight.category) && <option value={insight.category}>(not available)</option>}
      {groups.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
    </select>
    <small>For the highest and lowest value, the share and the biggest mover.</small>
  </label>
  return <fieldset className="narrative-fields"><legend>Narrative <Info label="Narrative">Sentences in plain text about the measure (on the Data tab), over the rows the narrative counts — the filter row or the dashboard’s period and filters, then its own filters, as for a chart. Tick the automatic sentences to show; add rules of your own: If a number compares with a value, then show your sentence, with a tone (Info, Good, Warning, Bad). Placeholders in a sentence are replaced by the numbers: {narrativePlaceholders.map((key) => `{${key}}`).join(' ')}. No AI and no request: the same rows always give the same sentences.</Info></legend>
    <div className="form-row">
      <label>Period on (optional)
        <select aria-label="Period on" value={narrative.period ?? ''} onChange={(event) => { const { period: _old, ...rest } = narrative; onChange({ ...insight, narrative: event.target.value ? { ...rest, period: event.target.value } : rest }) }}>
          <option value="">— None —</option>
          {narrative.period && !dates.some((column) => column.id === narrative.period) && <option value={narrative.period}>(not available)</option>}
          {dates.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
        <small>{dates.length ? 'A Date column: the latest period against the one before.' : 'The change needs a Date column on the page.'}</small>
      </label>
      {hasPeriod && <label>Period length
        <select aria-label="Period length" value={narrative.grain ?? 'month'} onChange={(event) => { const { grain: _old, ...rest } = narrative; const grain = event.target.value as NarrativeGrain; onChange({ ...insight, narrative: grain === 'month' ? rest : { ...rest, grain } }) }}>
          {narrativeGrains.map((grain) => <option key={grain} value={grain}>{grainLabels[grain]}</option>)}
        </select>
      </label>}
    </div>
    <fieldset className="narrative-checks" aria-label="Automatic sentences"><legend>Automatic sentences</legend>
      {narrativeAutoKeys.map((key) => { const reason = needs(key); return <label key={key} className="check" title={reason || autoLabels[key].hint}><input type="checkbox" disabled={Boolean(reason) && !narrative.auto.includes(key)} checked={narrative.auto.includes(key)} onChange={(event) => tick(key, event.target.checked)} />{autoLabels[key].label}{reason ? ` (${reason.replace(/\.$/, '').toLowerCase()})` : ''}</label> })}
    </fieldset>
    {narrative.auto.includes('threshold') && <div className="form-row">
      <label>Threshold
        <select aria-label="Threshold direction" value={narrative.threshold?.op ?? 'above'} onChange={(event) => set({ threshold: { op: event.target.value === 'below' ? 'below' : 'above', value: narrative.threshold?.value ?? 0 } })}>
          <option value="above">Above</option><option value="below">Below</option>
        </select>
      </label>
      <label>Threshold value<input type="number" inputMode="decimal" aria-label="Threshold value" value={Number.isFinite(narrative.threshold?.value) ? narrative.threshold!.value : ''} onChange={(event) => set({ threshold: { op: narrative.threshold?.op ?? 'above', value: event.target.value === '' ? Number.NaN : Number(event.target.value) } })} /></label>
    </div>}
    <fieldset className="narrative-checks narrative-rules" aria-label="Rules"><legend>Rules (optional, in order)</legend>
      {narrative.rules.map((rule, index) => <div key={index} className="narrative-rule" role="group" aria-label={`Rule ${index + 1}`}>
        <div className="narrative-rule-head">
          <label>If<select aria-label={`Rule ${index + 1} metric`} value={rule.metric} onChange={(event) => { const metric = event.target.value as NarrativeMetric; const ops = opsFor(metric); setRule(index, { metric, op: ops.includes(rule.op) ? rule.op : ops[0], value: metric === 'top' || rule.op === 'is_top' ? '' : rule.value }) }}>
            {metricOrder.map((metric) => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}
          </select></label>
          <label>Is<select aria-label={`Rule ${index + 1} operator`} value={rule.op} onChange={(event) => setRule(index, { op: event.target.value as NarrativeOp })}>
            {opsFor(rule.metric).map((op) => <option key={op} value={op}>{op === 'is_top' ? 'is' : opLabels[op]}</option>)}
          </select></label>
          <label>Value<input aria-label={`Rule ${index + 1} value`} type={rule.op === 'is_top' ? 'text' : 'number'} inputMode={rule.op === 'is_top' ? undefined : 'decimal'} maxLength={120} value={String(rule.value)} onChange={(event) => setRule(index, { value: event.target.value })} /></label>
          <label>Tone<select aria-label={`Rule ${index + 1} tone`} value={rule.tone} onChange={(event) => setRule(index, { tone: event.target.value as NarrativeTone })}>
            {narrativeToneKeys.map((tone) => <option key={tone} value={tone}>{toneLabels[tone]}</option>)}
          </select></label>
          <span className="button-row">
            <button type="button" className="ghost" disabled={index === 0} aria-label={`Move rule ${index + 1} up`} onClick={() => moveRule(index, -1)}>↑</button>
            <button type="button" className="ghost" disabled={index === narrative.rules.length - 1} aria-label={`Move rule ${index + 1} down`} onClick={() => moveRule(index, 1)}>↓</button>
            <button type="button" className="text-button danger-text" aria-label={`Remove rule ${index + 1}`} onClick={() => set({ rules: narrative.rules.filter((_, at) => at !== index) })}>✕</button>
          </span>
        </div>
        <label>Then show<textarea aria-label={`Rule ${index + 1} sentence`} maxLength={maxTemplate} rows={2} value={rule.template} placeholder="e.g. CoNQ cost above budget: {value}" onChange={(event) => setRule(index, { template: event.target.value })} /></label>
      </div>)}
      <button type="button" className="text-button" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => set({ rules: [...narrative.rules, blankRule()] })}>＋ Add rule</button>
      {addReason && <small>{addReason}</small>}
      {narrative.rules.length > 1 && <div className="narrative-checks" role="radiogroup" aria-label="Rules shown">
        <label className="check"><input type="radio" name="narrative-mode" checked={narrative.mode !== 'first'} onChange={() => { const { mode: _old, ...rest } = narrative; onChange({ ...insight, narrative: rest }) }} />Every rule that matches</label>
        <label className="check"><input type="radio" name="narrative-mode" checked={narrative.mode === 'first'} onChange={() => set({ mode: 'first' })} />Only the first rule that matches</label>
      </div>}
      {narrative.rules.length > 0 && <label>Else (optional)<input aria-label="Else sentence" maxLength={maxTemplate} value={narrative.otherwise ?? ''} placeholder="e.g. Nothing unusual in {period}." onChange={(event) => { const { otherwise: _old, ...rest } = narrative; onChange({ ...insight, narrative: event.target.value ? { ...rest, otherwise: event.target.value } : rest }) }} /><small>Shown when no rule matches.</small></label>}
    </fieldset>
    <SizeFields size={size} kind={kind} heightReason="A narrative takes the height of its sentences." onChange={(next) => { const out = cleanOptions('narrative', insight.measure, withSizeOptions(options, next, factoryOf(kind), true, kind)); const nextInsight = { ...insight }; if (out) nextInsight.options = out; else delete nextInsight.options; onChange(nextInsight) }} />
  </fieldset>
}
