import { useState } from 'react'
import { Notice, Panel } from './ui'
import { allProfiles, bucketKeys, bucketLabel, defaultProfile, plannedSourceLabel, plannedSources, profileFormula, treatmentLabel, treatments, type CalculationProfile } from '../calculationProfiles'
import { sharedTimeScopeLabel, sharedTimeScopes, type CapacitySettings } from '../capacity'

// CAP-41/42: Settings → Capacity → Calculation profiles. The built-in profiles can be copied, not changed; custom
// profiles are edited here by roles that manage shared settings. One profile is the default for every page.
export function CalculationProfilesPanel({ settings, canEdit, onSave }: { settings: CapacitySettings; canEdit: boolean; onSave: (profiles: CalculationProfile[], defaultId: string, detail: string) => void }) {
  const profiles = allProfiles(settings), custom = settings.calculationProfiles ?? [], current = defaultProfile(settings)
  const [draft, setDraft] = useState<CalculationProfile | null>(null)
  const [message, setMessage] = useState('')
  const save = (next: CalculationProfile[], defaultId: string, detail: string) => { onSave(next, defaultId, detail); setMessage(`${detail}. Save to Git so everyone gets it.`) }
  const copy = (profile: CalculationProfile) => setDraft({ ...profile, id: `p-${Date.now().toString(36)}`, name: `${profile.name} (copy)`.slice(0, 80), builtIn: undefined, treatment: { ...profile.treatment }, plannedSource: { ...profile.plannedSource }, excludedGroups: [...profile.excludedGroups] })
  return <Panel eyebrow="CAPACITY" title="Calculation profiles" info="A profile decides how utilization is calculated: for each bucket of hours whether it counts as utilized, comes off the capacity or is ignored; which hours the plan uses; and how the capacity is built. The default profile is used for every utilization figure in the app. Built-in profiles can be copied, not changed. Months whose figures are locked (Team overview → Utilization) keep the figures they were locked with. Saved with the planning data in Git; every change is in the audit log.">
    <div className="azure-table"><table aria-label="Calculation profiles"><thead><tr><th>Profile</th><th>Formula</th><th /></tr></thead><tbody>
      {profiles.map((profile) => <tr key={profile.id}>
        <td><strong>{profile.name}</strong>{profile.builtIn && <small>Built-in</small>}{profile.id === current.id && <small className="positive">Default</small>}</td>
        <td><small>{profileFormula(profile, settings)}</small></td>
        <td className="button-row">{canEdit && <>
          {profile.id !== current.id && <button type="button" className="text-button" onClick={() => save(custom, profile.id, `Default calculation profile = ${profile.name}`)}>Make default</button>}
          <button type="button" className="text-button" onClick={() => copy(profile)}>Copy</button>
          {!profile.builtIn && <button type="button" className="text-button" onClick={() => setDraft({ ...profile, treatment: { ...profile.treatment }, plannedSource: { ...profile.plannedSource }, excludedGroups: [...profile.excludedGroups] })}>Edit</button>}
          {!profile.builtIn && profile.id !== current.id && <button type="button" className="text-button" onClick={() => { if (window.confirm(`Delete the profile “${profile.name}”?`)) save(custom.filter((entry) => entry.id !== profile.id), current.id, `Calculation profile ${profile.name} deleted`) }}>Delete</button>}
        </>}</td>
      </tr>)}
    </tbody></table></div>
    {!canEdit && <p className="muted">Profiles are changed by roles that manage shared settings.</p>}
    {message && <Notice tone="success">{message}</Notice>}
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
    !bucketKeys.some((key) => draft.treatment[key] === 'count') && 'At least one bucket must count as utilized.',
    draft.capacityBase === 'fixed' && !(Number(draft.fixedHours) > 0 && Number(draft.fixedHours) <= 744) && 'Fixed hours must be between 0 and 744.',
  ].filter(Boolean) as string[]
  return <form className="standard-hours" aria-label="Edit calculation profile" onSubmit={(event) => { event.preventDefault(); if (!problems.length) onSave({ ...draft, name: draft.name.trim().slice(0, 80), ...(draft.capacityBase === 'fixed' ? { fixedHours: Number(draft.fixedHours) } : { fixedHours: undefined }) }) }}>
    <label>Profile name<input value={draft.name} maxLength={80} onChange={(event) => set({ name: event.target.value })} /></label>
    <div className="azure-table"><table aria-label="Buckets"><thead><tr><th>Bucket</th><th>Treatment</th><th>Planned hours from</th></tr></thead><tbody>
      {bucketKeys.map((key) => <tr key={key}><td>{bucketLabel[key]}</td>
        <td><select aria-label={`${bucketLabel[key]} treatment`} value={draft.treatment[key]} onChange={(event) => set({ treatment: { ...draft.treatment, [key]: event.target.value } })}>{treatments.map((value) => <option key={value} value={value}>{treatmentLabel[value]}</option>)}</select></td>
        <td><select aria-label={`${bucketLabel[key]} planned hours`} value={draft.plannedSource[key]} disabled={draft.treatment[key] !== 'count'} onChange={(event) => set({ plannedSource: { ...draft.plannedSource, [key]: event.target.value } })}>{plannedSources.map((value) => <option key={value} value={value}>{plannedSourceLabel[value]}</option>)}</select></td>
      </tr>)}
    </tbody></table></div>
    <div className="form-row">
      <label>Capacity base<select value={draft.capacityBase} onChange={(event) => set({ capacityBase: event.target.value as CalculationProfile['capacityBase'], fixedHours: event.target.value === 'fixed' ? draft.fixedHours ?? 160 : undefined })}><option value="workingDays">Working days employed × Working hours per day ({settings.hoursPerDay}h)</option><option value="fixed">Fixed hours a month</option></select></label>
      {draft.capacityBase === 'fixed' && <label>Fixed hours a month<input type="number" min={0} max={744} step={0.5} value={draft.fixedHours ?? ''} onChange={(event) => set({ fixedHours: event.target.value === '' ? undefined : Number(event.target.value) })} /><small>Pro rata to the days employed.</small></label>}
      <label>Status from<select value={draft.statusFrom} onChange={(event) => set({ statusFrom: event.target.value as CalculationProfile['statusFrom'] })}><option value="actual">Recorded utilization</option><option value="planned">Planned utilization</option></select></label>
    </div>
    <label className="inline-check"><input type="checkbox" checked={draft.minusStandardHours} onChange={(event) => set({ minusStandardHours: event.target.checked })} /> Deduct Standard Hours from the capacity (Team overview → Old Calculation)</label>
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
