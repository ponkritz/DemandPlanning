import { useState } from 'react'
import { Notice, Panel } from './ui'
import { FormulaBar } from './FormulaBar'
import { checkFormula, formulaFromParts } from '../formula'
import { absenceKindsOf, allProfiles, bucketKeys, bucketLabel, defaultProfile, defaultTerms, npraPartLabel, npraParts, npraPartsOf, plannedSourceLabel, plannedSources, profileFormula, formulaSentence, termHints, termKeys, termMeaning, termsOf, type CalculationProfile, type ProfileTerms, type TermKey } from '../calculationProfiles'
import { absenceKinds, sharedTimeScopeLabel, sharedTimeScopes, type CapacitySettings } from '../capacity'

// CAP-41/42: Admin → Capacity & time → Calculation profiles. Every profile can be copied and edited (built-ins too, CAP-53, with Reset to built-in); custom
// profiles are edited here by roles that manage shared settings. One profile is the default for every page.
export function CalculationProfilesPanel({ settings, canEdit, onSave, onSaveTerms }: { settings: CapacitySettings; canEdit: boolean; onSave: (profiles: CalculationProfile[], defaultId: string, detail: string) => void; onSaveTerms: (terms: ProfileTerms, detail: string) => void }) {
  const profiles = allProfiles(settings), custom = settings.calculationProfiles ?? [], current = defaultProfile(settings)
  const [draft, setDraft] = useState<CalculationProfile | null>(null)
  const [message, setMessage] = useState('')
  const [naming, setNaming] = useState<{ id: string; name: string; terms: Record<TermKey, string> } | null>(null)
  const save = (next: CalculationProfile[], defaultId: string, detail: string) => { onSave(next, defaultId, detail); setMessage(`${detail}. Save to Git so everyone gets it.`) }
  const copy = (profile: CalculationProfile) => setDraft({ ...profile, id: `p-${Date.now().toString(36)}`, name: `${profile.name} (copy)`.slice(0, 80), builtIn: undefined, edited: undefined, treatment: { ...profile.treatment }, plannedSource: { ...profile.plannedSource }, excludedGroups: [...profile.excludedGroups] })
  return <Panel eyebrow="CAPACITY" title="Calculation profiles" info="A profile decides how utilization is calculated: for each bucket of hours whether it counts as utilized, comes off the capacity or is ignored; which hours the plan uses; and how the capacity is built. The default profile is used for every utilization figure in the app. Every profile can be edited; a changed built-in profile keeps its place and can be reset to the built-in one. Months whose figures are locked (Team overview → Utilization) keep the figures they were locked with. Saved with the planning data in Git; every change is in the audit log.">
    <div className="azure-table"><table aria-label="Calculation profiles"><thead><tr><th>Profile</th><th>Formula</th><th /></tr></thead><tbody>
      {profiles.map((profile) => <tr key={profile.id}>
        <td><strong>{profile.name}</strong>{profile.builtIn && <small>{profile.edited ? 'Built-in, changed' : 'Built-in'}</small>}{profile.id === current.id && <small className="positive">Default</small>}</td>
        <td><strong className="formula-row">{formulaSentence(profile, settings)}</strong><small>{profileFormula(profile, settings)}</small><small className="profile-cards">Cards: {(['funded', 'absence', 'npra'] as const).map((key) => `${termsOf(settings, profile.id)[key]} ${termHints(profile, settings)[key]}`).join(' · ')}</small></td>
        <td className="button-row">{canEdit && <>
          {profile.id !== current.id && <button type="button" className="text-button" onClick={() => save(custom, profile.id, `Default calculation profile = ${profile.name}`)}>Make default</button>}
          <button type="button" className="text-button" onClick={() => copy(profile)}>Copy</button>
          <button type="button" className="text-button" onClick={() => setNaming({ id: profile.id, name: profile.name, terms: termsOf(settings, profile.id) })}>Names</button>
          <button type="button" className="text-button" onClick={() => setDraft({ ...profile, treatment: { ...profile.treatment }, plannedSource: { ...profile.plannedSource }, excludedGroups: [...profile.excludedGroups] })}>Edit</button>
          {profile.edited && <button type="button" className="text-button" onClick={() => { if (window.confirm(`Reset “${profile.name}” to the built-in profile? Its changes are removed; locked months keep their figures.`)) save(custom.filter((entry) => entry.id !== profile.id), current.id, `Calculation profile ${profile.name} reset to the built-in one`) }}>Reset to built-in</button>}
          {!profile.builtIn && profile.id !== current.id && <button type="button" className="text-button" onClick={() => { if (window.confirm(`Delete the profile “${profile.name}”?`)) save(custom.filter((entry) => entry.id !== profile.id), current.id, `Calculation profile ${profile.name} deleted`) }}>Delete</button>}
        </>}</td>
      </tr>)}
    </tbody></table></div>
    {!canEdit && <p className="muted">Profiles are changed by roles that manage shared settings.</p>}
    {message && <Notice tone="success">{message}</Notice>}
    {naming && <form className="standard-hours" aria-label={`Names in ${naming.name}`} onSubmit={(event) => { event.preventDefault(); const own = Object.fromEntries(termKeys.flatMap((key) => naming.terms[key].trim() && naming.terms[key].trim() !== defaultTerms[key] ? [[key, naming.terms[key].trim()]] : [])); const next = { ...(settings.profileTerms ?? {}) }; if (Object.keys(own).length) next[naming.id] = own; else delete next[naming.id]; onSaveTerms(next, `Names in the calculation profile ${naming.name}: ${termKeys.map((key) => `${defaultTerms[key]} = ${naming.terms[key].trim() || defaultTerms[key]}`).join('; ')}`); setMessage(`Names in ${naming.name} saved here. Save to Git so everyone gets them.`); setNaming(null) }}>
      <strong>Names in “{naming.name}”</strong><p className="muted">The names its cards, columns and formula use. Letters, digits, spaces and ( ) &amp; / + . % -, up to 40 characters; empty = the built-in name.</p>
      <div className="form-row">{termKeys.map((key) => <label key={key}>{defaultTerms[key]}<input aria-label={`Name for ${defaultTerms[key]}`} value={naming.terms[key]} maxLength={40} onChange={(event) => setNaming({ ...naming, terms: { ...naming.terms, [key]: event.target.value } })} /><small>{termMeaning[key]}</small></label>)}</div>
      <div className="button-row"><button type="submit" className="primary">Save names</button><button type="button" className="ghost" onClick={() => setNaming({ ...naming, terms: { ...defaultTerms } })}>Use built-in names</button><button type="button" className="ghost" onClick={() => setNaming(null)}>Cancel</button></div>
    </form>}
    {draft && <ProfileEditor draft={draft} settings={settings} onChange={setDraft} onCancel={() => setDraft(null)} onSave={(profile) => {
      const exists = custom.some((entry) => entry.id === profile.id)
      save(exists ? custom.map((entry) => entry.id === profile.id ? profile : entry) : [...custom, profile], current.id, `Calculation profile ${profile.name} ${exists ? 'changed' : 'added'}: ${profileFormula(profile, settings)}`)
      setDraft(null)
    }} />}
  </Panel>
}

function ProfileEditor({ draft, settings, onChange, onCancel, onSave }: { draft: CalculationProfile; settings: CapacitySettings; onChange: (profile: CalculationProfile) => void; onCancel: () => void; onSave: (profile: CalculationProfile) => void }) {
  const set = (change: Partial<CalculationProfile>) => onChange({ ...draft, ...change })
  const problems = [
    !draft.name.trim() && 'Give the profile a name.',
    draft.formula === undefined && !bucketKeys.some((key) => draft.treatment[key] === 'count') && 'Tick at least one figure in the top of the formula.',
    draft.formula !== undefined && (() => { const check = checkFormula(draft.formula); return check.ok ? false : `Formula: ${check.error}` })(),
    draft.capacityBase === 'fixed' && !(Number(draft.fixedHours) > 0 && Number(draft.fixedHours) <= 744) && 'Fixed hours must be between 0 and 744.',
  ].filter(Boolean) as string[]
  return <form className="standard-hours" aria-label="Edit calculation profile" onSubmit={(event) => { event.preventDefault(); if (!problems.length) onSave({ ...draft, name: draft.name.trim().slice(0, 80), ...(draft.capacityBase === 'fixed' ? { fixedHours: Number(draft.fixedHours) } : { fixedHours: undefined }) }) }}>
    <label>Profile name<input value={draft.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} /></label>
    {/* CAP-54: the utilization formula picked as terms — Top (counts as utilized) ÷ Bottom (Funded Hours minus). A figure
        is in the top, in the bottom or in neither (ignored), never in both. */}
    <fieldset className="formula-builder"><legend>Utilization formula</legend>
      <p className="formula-sentence" role="status" aria-label="Formula">{formulaSentence(draft, settings)}</p>
      {/* CAP-55: or type the formula, as in Excel; the ticks below give the starting formula. */}
      <label className="inline-check fx-toggle"><input type="checkbox" checked={draft.formula !== undefined} onChange={(event) => { if (event.target.checked) set({ formula: formulaFromParts(bucketKeys.filter((key) => draft.treatment[key] === 'count').map((key) => bucketLabel[key]), bucketKeys.filter((key) => draft.treatment[key] === 'deduct').map((key) => bucketLabel[key]), draft.minusStandardHours) }); else { const { formula: _formula, ...rest } = draft; onChange(rest) } }} />Type the formula (fx)</label>
      {draft.formula !== undefined && <>
        <FormulaBar value={draft.formula} onChange={(formula) => set({ formula })} />
        <div className="formula-sources" role="group" aria-label="Planned hours">{(['work', 'training', 'npraOther', 'common'] as const).map((key) => <label key={key} className="inline-select">{bucketLabel[key]} planned<select aria-label={`${bucketLabel[key]} planned hours`} value={draft.plannedSource[key]} onChange={(event) => set({ plannedSource: { ...draft.plannedSource, [key]: event.target.value as typeof draft.plannedSource[typeof key] } })}>{plannedSources.map((value) => <option key={value} value={value}>{plannedSourceLabel[value]}</option>)}</select></label>)}</div>
      </>}
      <div className="formula-parts" hidden={draft.formula !== undefined}>
        <div role="group" aria-label="Top: counts as utilized"><strong>Top — counts as utilized</strong><small className="muted">Total actual (Completed Work); Total planned from the source chosen.</small>
          {bucketKeys.map((key) => <div key={key} className="formula-term"><label className="inline-check"><input type="checkbox" aria-label={`${bucketLabel[key]} in the top`} checked={draft.treatment[key] === 'count'} onChange={(event) => set({ treatment: { ...draft.treatment, [key]: event.target.checked ? 'count' : 'ignore' } })} /> {bucketLabel[key]}</label>
            {draft.treatment[key] === 'count' && <select aria-label={`${bucketLabel[key]} planned hours`} value={draft.plannedSource[key]} onChange={(event) => set({ plannedSource: { ...draft.plannedSource, [key]: event.target.value } })}>{plannedSources.map((value) => <option key={value} value={value}>Plan: {plannedSourceLabel[value]}</option>)}</select>}</div>)}
        </div>
        <div className="formula-divide" aria-hidden="true">÷</div>
        <div role="group" aria-label="Bottom: taken off Funded Hours"><strong>Bottom — Funded Hours minus</strong><small className="muted">The capacity base below, less the ticked figures (never below 0).</small>
          {bucketKeys.map((key) => <label key={key} className="inline-check formula-term"><input type="checkbox" aria-label={`${bucketLabel[key]} in the bottom`} checked={draft.treatment[key] === 'deduct'} onChange={(event) => set({ treatment: { ...draft.treatment, [key]: event.target.checked ? 'deduct' : 'ignore' } })} /> {bucketLabel[key]}</label>)}
          <label className="inline-check formula-term"><input type="checkbox" aria-label="Standard Hours in the bottom" checked={draft.minusStandardHours} onChange={(event) => set({ minusStandardHours: event.target.checked })} /> Standard Hours (Team overview → Old Calculation)</label>
        </div>
      </div>
      {bucketKeys.some((key) => draft.treatment[key] === 'ignore') && <small className="muted">Not in the formula (ignored): {bucketKeys.filter((key) => draft.treatment[key] === 'ignore').map((key) => bucketLabel[key]).join(', ')}.</small>}
    </fieldset>
    <div className="form-row">
      <label>Capacity base<select value={draft.capacityBase} onChange={(event) => set({ capacityBase: event.target.value as CalculationProfile['capacityBase'], fixedHours: event.target.value === 'fixed' ? draft.fixedHours ?? 160 : undefined })}><option value="workingDays">Working days employed × Funded hours per day ({settings.hoursPerDay}h)</option><option value="fixed">Fixed hours a month</option></select></label>
      {draft.capacityBase === 'fixed' && <label>Fixed hours a month<input type="number" min={0} max={744} step={0.5} value={draft.fixedHours ?? ''} onChange={(event) => set({ fixedHours: event.target.value === '' ? undefined : Number(event.target.value) })} /><small>Pro rata to the days employed.</small></label>}
      <label>Status from<select value={draft.statusFrom} onChange={(event) => set({ statusFrom: event.target.value as CalculationProfile['statusFrom'] })}><option value="actual">Recorded utilization</option><option value="planned">Planned utilization</option></select></label>
    </div>
    <div role="group" aria-label="Absence includes"><strong>Absence includes:</strong> {absenceKinds.map((kind) => <label key={kind} className="inline-check"><input type="checkbox" checked={absenceKindsOf(draft).includes(kind)} onChange={(event) => { const next = event.target.checked ? absenceKinds.filter((entry) => entry === kind || absenceKindsOf(draft).includes(entry)) : absenceKindsOf(draft).filter((entry) => entry !== kind); set({ absenceKinds: next.length === absenceKinds.length ? undefined : next }) }} /> {kind}</label>)}<small className="muted"> Leave not ticked is ignored: not deducted and not in the Absence figure.</small></div>
    <div role="group" aria-label="NPRA Hours include"><strong>NPRA Hours include:</strong> {npraParts.map((part) => <label key={part} className="inline-check"><input type="checkbox" checked={npraPartsOf(draft).includes(part)} onChange={(event) => { const next = event.target.checked ? npraParts.filter((entry) => entry === part || npraPartsOf(draft).includes(entry)) : npraPartsOf(draft).filter((entry) => entry !== part); set({ npraIncludes: next.length === npraParts.length ? undefined : next }) }} /> {npraPartLabel[part]}</label>)}<small className="muted"> The NPRA Hours figure only; how the hours count is set by the Training and Other NPRA buckets above.</small></div>
    <div role="group" aria-label="Shared-time groups counted"><strong>Shared time counted:</strong> {sharedTimeScopes.map((scope) => <label key={scope} className="inline-check"><input type="checkbox" checked={!draft.excludedGroups.includes(scope)} onChange={(event) => set({ excludedGroups: event.target.checked ? draft.excludedGroups.filter((entry) => entry !== scope) : [...draft.excludedGroups, scope] })} /> {sharedTimeScopeLabel(scope)}</label>)}</div>
    <p className="muted" role="note">{profileFormula(draft, settings)}</p>
    {problems.map((problem) => <p key={problem} className="warning-text">{problem}</p>)}
    <div className="button-row"><button type="submit" className="primary" disabled={problems.length > 0}>Save profile</button><button type="button" className="ghost" onClick={onCancel}>Cancel</button></div>
  </form>
}

// CAP-44: an Admin views a page with another calculation profile. Only that page, only for them; nothing is saved and
// everyone else keeps the default. Locked months keep their locked figures whatever profile is viewed.
export function ProfilePicker({ settings, value, onChange }: { settings: CapacitySettings; value: string; onChange: (id: string) => void }) {
  const current = defaultProfile(settings), profiles = allProfiles(settings)
  const chosen = profiles.find((profile) => profile.id === value)
  return <div className="profile-picker" role="group" aria-label="Calculation profile">
    <label className="dash-select">Profile<select value={chosen ? chosen.id : ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">{current.name} (default)</option>
      {profiles.filter((profile) => profile.id !== current.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
    </select></label>
    {chosen && chosen.id !== current.id && <p className="warning-text" role="note">Viewing with “{chosen.name}”: only on this page and only for you. Everyone else sees “{current.name}”. Locked months keep their locked figures.</p>}
  </div>
}
