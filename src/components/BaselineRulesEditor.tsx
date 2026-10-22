import { useState } from 'react'
import { describeRule, exampleBaselineRules, normalizeRules, type BaselineRule } from '../baseline'
import { Notice, Panel } from './ui'

// Editor for the estimation rules: one row per stream, all with the same formula
// hours per unit × (fixed units per release + units per driver × driver count), with an optional maximum.
// Works on a local draft; Save normalises and stores it. readOnly (a Git token that cannot save): shown, not edited.
const blank = (stream: string): BaselineRule => ({ stream, hoursPerUnit: 0, baseUnits: 0, driver: 'documents', unitsPerDriver: 1 })

export function BaselineRulesEditor({ rules, streams, onSave, readOnly = false }: { rules: BaselineRule[]; streams: string[]; onSave: (rules: BaselineRule[]) => void; readOnly?: boolean }) {
  const [draft, setDraft] = useState<BaselineRule[]>(rules)
  const [saved, setSaved] = useState('')
  const dirty = JSON.stringify(normalizeRules(draft)) !== JSON.stringify(rules)
  const update = (index: number, patch: Partial<BaselineRule>) => { setSaved(''); setDraft((current) => current.map((rule, position) => position === index ? { ...rule, ...patch } : rule)) }
  const number = (value: string) => value === '' ? 0 : Number(value)
  const unused = streams.filter((stream) => !draft.some((rule) => rule.stream.toLowerCase() === stream.toLowerCase()))
  const unset = draft.filter((rule) => rule.stream.trim() && !rule.hoursPerUnit).map((rule) => rule.stream)

  return <Panel className="admin-section" eyebrow="BASELINE" title="Estimation rules" info="Every stream uses the same formula: Baseline = hours per unit × (fixed units per release + units per driver × driver count), with an optional maximum. Fixed units are the documents every release of the stream has whatever its size; the driver (documents, assets, …) adds units per counted item. Values shown are examples until the exact baseline is entered."
    action={readOnly ? undefined : <div className="button-row"><button type="button" className="ghost" onClick={() => { setSaved(''); setDraft(exampleBaselineRules) }}>Load example values</button><button type="button" className="primary" disabled={!dirty} onClick={() => { const next = normalizeRules(draft); onSave(next); setDraft(next); setSaved('Estimation rules saved.') }}>Save rules</button></div>}>
    {saved && <Notice tone="success">{saved}</Notice>}
    {unset.length > 0 && <Notice tone="warning">No hours per unit yet for {unset.join(', ')}: their baseline is 0h until the formula is filled in.</Notice>}
    <fieldset className="plain-fieldset" disabled={readOnly}><div className="azure-table"><table className="rule-table uniform-rules"><thead><tr><th>Stream (Epic title)</th><th>Hours per unit</th><th>Fixed units per release</th><th>Driver</th><th>Units per driver</th><th>Maximum hours</th><th>Formula</th><th /></tr></thead><tbody>
      {draft.map((rule, index) => <tr key={index}>
        <td><input aria-label="Stream (Epic title)" value={rule.stream} onChange={(event) => update(index, { stream: event.target.value })} /></td>
        <td><input aria-label={`Hours per unit for ${rule.stream}`} type="number" min="0" step="0.05" value={rule.hoursPerUnit} onChange={(event) => update(index, { hoursPerUnit: number(event.target.value) })} /></td>
        <td><input aria-label={`Fixed units per release for ${rule.stream}`} type="number" min="0" step="1" value={rule.baseUnits} onChange={(event) => update(index, { baseUnits: number(event.target.value) })} /></td>
        <td><input aria-label={`Driver for ${rule.stream}`} placeholder="e.g. documents, assets" value={rule.driver} onChange={(event) => update(index, { driver: event.target.value })} /></td>
        <td><input aria-label={`Units per driver for ${rule.stream}`} type="number" min="0" step="1" value={rule.unitsPerDriver} onChange={(event) => update(index, { unitsPerDriver: number(event.target.value) })} /></td>
        <td><input aria-label={`Maximum hours for ${rule.stream}`} type="number" min="0" step="0.25" value={rule.cap ?? ''} placeholder="None" onChange={(event) => update(index, { cap: event.target.value === '' ? undefined : number(event.target.value) })} /></td>
        <td className="rule-formula">{describeRule(normalizeRules([rule])[0] ?? rule)}</td>
        <td><button type="button" className="text-button" aria-label={`Remove ${rule.stream || 'stream'}`} onClick={() => { setSaved(''); setDraft((current) => current.filter((_, position) => position !== index)) }}>✕</button></td>
      </tr>)}
    </tbody></table></div></fieldset>
    {!readOnly && <div className="button-row rule-add">{unused.length > 0 && <select aria-label="Add a rule for stream" value="" onChange={(event) => { if (!event.target.value) return; setSaved(''); setDraft((current) => [...current, blank(event.target.value)]) }}><option value="">＋ Add rule for a stream…</option>{unused.map((stream) => <option key={stream}>{stream}</option>)}</select>}<button type="button" className="ghost" onClick={() => { setSaved(''); setDraft((current) => [...current, blank('')]) }}>＋ Custom stream</button></div>}
  </Panel>
}
