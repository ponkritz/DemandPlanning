import { useState } from 'react'
import { Notice, Panel } from './ui'
import { bucketRuleKeys, bucketRuleLabel, defaultBucketRules, normalizeBucketRules, normalizeWords, rulesOf, type BucketRuleKey, type BucketRules } from '../bucketRules'
import { capacityModel, type CapacitySettings } from '../capacity'
import type { AzureWorkItem } from '../domain'
import { formatHours, monthName } from '../format'

// CAP-46: Settings → Capacity & periods → Bucket rules. The words and tags that put a month Time Writing Task in Absence
// (PTO, Sick Leave, Unplanned Leave), Training or Other NPRA; changed by roles that manage shared settings, shared in Git
// and audited. The check below shows what the draft does to the selected month before it is saved.
const hint: Record<BucketRuleKey, string> = {
  unplannedWords: 'Leave Tasks under the absence Epic whose title (or a title above them) has one of these words. Checked first.',
  sickWords: 'Checked second.', ptoWords: 'Checked third; other leave is Other absence.',
  trainingWords: 'A Task or User Story under the absence Epic with one of these words in its title is Training, not leave.',
  trainingTags: 'A tag starting with one of these words, on the Task or anything above it, makes it Training (anywhere).',
  npraTags: 'A tag starting with one of these words makes it Other NPRA (anywhere). Training tags count as NPRA too.',
}
export function BucketRulesPanel({ settings, items, month, canEdit, onSave }: { settings: CapacitySettings; items: AzureWorkItem[]; month: string; canEdit: boolean; onSave: (rules: BucketRules | undefined, detail: string) => void }) {
  const saved = rulesOf(settings)
  const [draft, setDraft] = useState<Record<BucketRuleKey, string> | null>(null)
  const [message, setMessage] = useState('')
  const draftRules: BucketRules | null = draft ? Object.fromEntries(bucketRuleKeys.map((key) => [key, normalizeWords(draft[key])])) as unknown as BucketRules : null
  const emptyWords = draftRules ? bucketRuleKeys.filter((key) => key.endsWith('Words') && !draftRules[key].length) : []
  const totals = (rules: BucketRules) => { const model = capacityModel(items, month, { ...settings, bucketRules: rules, figureLocks: undefined }); return model.totals }
  const now = draftRules ? totals(saved) : null, next = draftRules ? totals(draftRules) : null
  return <Panel eyebrow="CAPACITY" title="Bucket rules" info={`Which month Time Writing Tasks count as Absence (PTO, Sick Leave, Unplanned Leave, Other absence), Training or Other NPRA. Absence is everything under the Team Holidays and Training Epic #${settings.absenceEpicId} (set under Capacity and absence) that is not training; holidays and common activities are mapped under Holidays and common activities. Everything else is Project work. Title words match whole words; a tag matches when it starts with the word. Letter case is ignored. Locked months keep their figures. Saved with the planning data in Git; every change is in the audit log.`}>
    <div className="azure-table"><table aria-label="Bucket rules"><thead><tr><th>Rule</th><th>Words</th></tr></thead><tbody>
      {bucketRuleKeys.map((key) => <tr key={key}><td><strong>{bucketRuleLabel[key]}</strong><small>{hint[key]}</small></td><td>
        {draft ? <input aria-label={bucketRuleLabel[key]} value={draft[key]} maxLength={900} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /> : saved[key].join(', ') || '—'}
      </td></tr>)}
    </tbody></table></div>
    {!draft && (canEdit ? <div className="button-row"><button type="button" className="ghost" onClick={() => { setMessage(''); setDraft(Object.fromEntries(bucketRuleKeys.map((key) => [key, saved[key].join(', ')])) as Record<BucketRuleKey, string>) }}>Edit bucket rules</button></div> : <p className="muted">Changed by roles that manage shared settings.</p>)}
    {draft && draftRules && now && next && <>
      <p className="muted" role="note">Words are separated by commas: letters, digits, spaces and hyphens, up to 40 characters, at most 20 per rule.</p>
      <div className="azure-table"><table aria-label={`Check with ${monthName(month)}`}><thead><tr><th>{monthName(month)}, whole team</th><th className="num">Saved rules</th><th className="num">This draft</th></tr></thead><tbody>
        {([['Absence hours', 'absence'], ['Training', 'training'], ['Other NPRA', 'npraOther'], ['Project work', 'work']] as const).map(([label, key]) => <tr key={key}><td>{label}</td><td className="num">{formatHours(now[key])}</td><td className="num">{formatHours(next[key])}</td></tr>)}
      </tbody></table></div>
      {emptyWords.length > 0 && <p className="warning-text">{emptyWords.map((key) => bucketRuleLabel[key]).join(', ')}: empty — the built-in words will be used.</p>}
      <div className="button-row">
        <button type="button" className="primary" onClick={() => { const stored = normalizeBucketRules(draftRules); const detail = `Bucket rules ${stored ? 'changed' : 'set to the built-in ones'}: ${bucketRuleKeys.map((key) => `${bucketRuleLabel[key]} = ${(stored ?? defaultBucketRules)[key].join(', ') || 'none'}`).join('; ')}`; onSave(stored, detail); setDraft(null); setMessage('Bucket rules saved here. Save to Git so everyone gets them.') }}>Save bucket rules</button>
        <button type="button" className="ghost" onClick={() => setDraft(Object.fromEntries(bucketRuleKeys.map((key) => [key, defaultBucketRules[key].join(', ')])) as Record<BucketRuleKey, string>)}>Use built-in words</button>
        <button type="button" className="ghost" onClick={() => setDraft(null)}>Cancel</button>
      </div>
    </>}
    {message && <Notice tone="success">{message}</Notice>}
  </Panel>
}
