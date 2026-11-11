import { useState } from 'react'
import { Notice, Panel } from './ui'
import { defaultInsightThresholds, normalizeInsightThresholds, thresholdFields, thresholdsOf, validThreshold, type InsightThresholds, type ThresholdKey } from '../insightThresholds'
import type { CapacitySettings } from '../capacity'

// CAP-47: Settings → Capacity & periods → Insight thresholds. The limits behind the Team overview insights, changed by
// roles that manage shared settings, shared in Git and audited.
export function InsightThresholdsPanel({ settings, canEdit, onSave }: { settings: CapacitySettings; canEdit: boolean; onSave: (thresholds: InsightThresholds | undefined, detail: string) => void }) {
  const saved = thresholdsOf(settings)
  const [draft, setDraft] = useState<Record<ThresholdKey, string> | null>(null)
  const [message, setMessage] = useState('')
  const values = draft ? Object.fromEntries(thresholdFields.map(({ key }) => [key, Number(draft[key])])) as unknown as InsightThresholds : null
  const wrong = values ? thresholdFields.filter(({ key }) => draft![key].trim() === '' || !validThreshold(key, values[key])) : []
  const amberAboveGreen = values ? values.healthAmber >= values.healthGreen : false
  const start = (from: InsightThresholds) => setDraft(Object.fromEntries(thresholdFields.map(({ key }) => [key, String(from[key])])) as Record<ThresholdKey, string>)
  return <Panel eyebrow="CAPACITY" title="Insight thresholds" info="The limits the Team overview insights use: month-end forecast, plan accuracy, stream momentum, resilience, unusual months, plan health, persistent overload and concentration. The Overloaded and Has capacity bands are under Capacity and absence. Saved with the planning data in Git; every change is in the audit log.">
    <div className="azure-table"><table aria-label="Insight thresholds"><thead><tr><th>Insight</th><th>Threshold</th><th className="num">Value</th></tr></thead><tbody>
      {thresholdFields.map((field, index) => {
        // Each insight is named once, on its first threshold; the built-in value shows only where it differs (or while editing).
        const first = index === 0 || thresholdFields[index - 1].group !== field.group
        const span = thresholdFields.filter((entry) => entry.group === field.group).length
        const builtIn = defaultInsightThresholds[field.key], changed = saved[field.key] !== builtIn
        return <tr key={field.key}>{first && <td rowSpan={span}><strong>{field.group}</strong></td>}<td>{field.label}<small>{field.min}–{field.max} {field.unit}</small></td>
          <td className="num">{draft ? <input aria-label={`${field.group}: ${field.label}`} type="number" min={field.min} max={field.max} step={field.unit === 'months' ? 1 : 0.5} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /> : `${saved[field.key]} ${field.unit}`}
            {(draft || changed) && <small className="muted">built-in {builtIn} {field.unit}</small>}</td></tr>
      })}
    </tbody></table></div>
    {!draft && (canEdit ? <div className="button-row"><button type="button" className="ghost" onClick={() => { setMessage(''); start(saved) }}>Edit insight thresholds</button></div> : <p className="muted">Changed by roles that manage shared settings.</p>)}
    {draft && <>
      {wrong.length > 0 && <p className="warning-text">Out of range: {wrong.map((field) => `${field.group} — ${field.label}`).join('; ')}.</p>}
      {amberAboveGreen && <p className="warning-text">Plan health: amber must be below green.</p>}
      <div className="button-row">
        <button type="button" className="primary" disabled={wrong.length > 0 || amberAboveGreen} onClick={() => { const stored = normalizeInsightThresholds(values); onSave(stored, `Insight thresholds ${stored ? 'changed' : 'set to the built-in values'}: ${thresholdFields.map(({ key, group, label, unit }) => `${group} ${label} ${(stored ?? defaultInsightThresholds)[key]} ${unit}`).join('; ')}`); setDraft(null); setMessage('Insight thresholds saved here. Save to Git so everyone gets them.') }}>Save insight thresholds</button>
        <button type="button" className="ghost" onClick={() => start(defaultInsightThresholds)}>Use built-in values</button>
        <button type="button" className="ghost" onClick={() => setDraft(null)}>Cancel</button>
      </div>
    </>}
    {message && <Notice tone="success">{message}</Notice>}
  </Panel>
}
