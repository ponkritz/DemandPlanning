import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { classificationOf, copyEpicFields, emptyEpicSetup, newStoryTemplateId, templatesFor, upsertStoryTemplate, type StoryTemplateItem, featureFromFields, fieldTypes, ifEmptyOptions, intoOptions, maxEpicFields, serializeEpicSetup, upsertEpicFields, type EpicField, type EpicFields, type EpicSetupFile } from '../epicSetup'
import { chooseSetup, classSetKey, dpEpicId, emptySetup, fieldKey, inheritFields, serializeFeatureSetup, setForClass, setupFor, type EpicSetup, type FeatureSetupFile, type InheritField, type SetupDefaults, type StoryTemplate } from '../featureSetup'
import { useCan } from '../useCan'
import type { EpicSetupStore } from '../useEpicSetup'
import type { FeatureSetup } from '../useFeatureSetup'
import type { GitStorage } from '../useGitStorage'
import { useBulkEpic } from '../useStreamEpics'
import { Notice } from './ui'

// CON-97 Admin → Epic & Feature setup → Setup per Epic: one screen per Epic. The Epic list (All Epics first) on the
// left; on the right a preview of a new Feature and four sections in the order it is built — Fields & title, Definition
// of Done, User Stories, Month Task — each with one "Customize for this Epic" switch (off: All Epics applies). "Use my
// own version" edits the person's own copy; one Save writes the Epic setup and the Feature setup together.
type Section = 'fields' | 'dod' | 'stories' | 'task'
const emptyFile = (): FeatureSetupFile => ({ schema: 1, kind: 'feature-setup', epics: [] })
const sectionField: Record<Exclude<Section, 'fields'>, InheritField> = { dod: 'featureDoD', stories: 'stories', task: 'estimate' }

export function EpicFeatureEditor({ setup, epicSetup, git, items, qeColumnNames = [], initialEpicId = 0 }: { setup: FeatureSetup; epicSetup: EpicSetupStore; git: GitStorage; items: AzureWorkItem[]; qeColumnNames?: string[]; initialEpicId?: number }) {
  const can = useCan()
  const dpBulkEpic = useBulkEpic('DP').epicId, ioccBulkEpic = useBulkEpic('IOCC').epicId
  const [epicId, setEpicId] = useState<number>(initialEpicId) // 0 = All Epics
  const [mine, setMine] = useState(false)
  const [find, setFind] = useState('')
  // DPF-07: the Release Classification value whose DoD and User Stories are shown ('' = the Epic's default).
  const [cls, setCls] = useState('')
  const [shared, setShared] = useState<FeatureSetupFile | null>(null)
  const [personal, setPersonal] = useState<FeatureSetupFile | null>(null)
  const [copyTo, setCopyTo] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const writable = git.connected && !git.readOnly && !git.isSample
  const canShared = writable && can('setup.feature'), canFields = writable && can('setup.epic'), canMine = writable && Boolean(setup.email)
  const sharedFile = shared ?? setup.shared ?? emptyFile()
  const personalFile = personal ?? setup.personal ?? emptyFile()
  const epicFile: EpicSetupFile = epicSetup.draft ?? epicSetup.file ?? emptyEpicSetup()
  const isAll = epicId === 0
  const useMine = mine && !isAll
  const layerFile = useMine ? personalFile : sharedFile
  const editable = useMine ? canMine : canShared
  const defaults: SetupDefaults = sharedFile.defaults ?? {}
  const dirtyShared = Boolean(shared) && serializeFeatureSetup(shared!) !== serializeFeatureSetup(setup.shared ?? emptyFile())
  const dirtyPersonal = Boolean(personal) && serializeFeatureSetup(personal!) !== serializeFeatureSetup(setup.personal ?? emptyFile())
  const dirtyEpic = Boolean(epicSetup.draft) && serializeEpicSetup(epicSetup.draft!) !== serializeEpicSetup(epicSetup.file ?? emptyEpicSetup())
  const dirty = dirtyShared || dirtyPersonal || dirtyEpic

  // The Epics: every Epic on the board and every Epic with a setup, by name.
  const boardEpics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed')
  const known = new Map<number, string>()
  for (const item of boardEpics) known.set(item.id, item.title)
  for (const entry of [...sharedFile.epics, ...personalFile.epics]) if (!known.has(entry.epicId)) known.set(entry.epicId, entry.epicTitle)
  for (const entry of epicFile.epics) if (!known.has(entry.epicId)) known.set(entry.epicId, entry.epicTitle)
  const customizedCount = (id: number) => {
    const entry = setupFor(sharedFile, id)
    const own = entry ? inheritFields.filter((field) => !(entry.inherits ?? []).includes(field)).length : 0
    return own + (epicFile.epics.some((item) => item.epicId === id && item.fields.length) ? 1 : 0)
  }
  const epics = [...known.entries()].map(([id, title]) => ({ id, title, count: customizedCount(id), mineToo: Boolean(setupFor(personalFile, id)) }))
    .filter((epic) => !find.trim() || `#${epic.id} ${epic.title}`.toLowerCase().includes(find.trim().toLowerCase()))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
  const title = isAll ? 'All Epics — defaults' : `${known.get(epicId) || 'Epic'} #${epicId}`

  // The entry being edited (shared or mine) and the values a new Feature would get.
  const entry = isAll ? undefined : setupFor(layerFile, epicId)
  const fieldsEntry: EpicFields | undefined = isAll ? undefined : epicFile.epics.find((item) => item.epicId === epicId)
  const resolved = isAll ? undefined : chooseSetup({ shared: sharedFile, personal: personalFile }, epicId, !useMine).setup
  const inheritsHere = (field: InheritField) => !entry || (entry.inherits ?? []).includes(field)
  const custom: Record<Section, boolean> = { fields: Boolean(fieldsEntry?.fields.length), dod: !isAll && !inheritsHere('featureDoD'), stories: !isAll && !inheritsHere('stories'), task: !isAll && !inheritsHere('estimate') }
  const hasSets = !isAll && (epicId === dpEpicId || epicId === dpBulkEpic || epicId === ioccBulkEpic)
  const classes = classificationOf(epicFile, epicId)
  const value = isAll ? '' : cls
  const ownKey = value ? classSetKey(entry, value) : undefined
  const own = ownKey ? entry!.classSets![ownKey] : undefined
  const forValue = value ? setForClass(resolved, value) : undefined
  const dod = isAll ? defaults.featureDoD ?? '' : forValue?.featureDoD ?? resolved?.featureDoD ?? ''
  const stories: StoryTemplate[] = isAll ? defaults.stories ?? [] : forValue?.stories ?? resolved?.stories ?? []
  const estimate = isAll ? defaults.originalEstimate : resolved?.task.originalEstimate

  // Changes: to the layer's file (shared or mine), the All Epics defaults, or the Epic setup.
  const putLayer = (next: FeatureSetupFile) => { if (useMine) setPersonal(next); else setShared(next); setResult(null) }
  const changeEntry = (update: (value: EpicSetup) => void) => {
    const next = structuredClone(layerFile)
    let value = next.epics.find((item) => item.epicId === epicId)
    if (!value) { value = { ...emptySetup(epicId, known.get(epicId) ?? ''), inherits: [...inheritFields] }; next.epics.push(value) }
    update(value)
    if (!value.inherits?.length) delete value.inherits
    putLayer(next)
  }
  // BKL-38: Complete children per Epic, in the shared setup only (a team decision); on unless turned off.
  const completeChildrenHere = isAll || setupFor(sharedFile, epicId)?.completeChildren !== false
  const setCompleteChildren = (on: boolean) => {
    const next = structuredClone(sharedFile)
    let value = next.epics.find((item) => item.epicId === epicId)
    if (!value) { value = { ...emptySetup(epicId, known.get(epicId) ?? ''), inherits: [...inheritFields] }; next.epics.push(value) }
    if (on) delete value.completeChildren; else value.completeChildren = false
    setShared(next); setResult(null)
  }
  const changeDefaults = (update: (value: SetupDefaults) => void) => { const next = structuredClone(sharedFile); const value = { ...(next.defaults ?? {}) }; update(value); next.defaults = value; setShared(next); setResult(null) }
  const changeFields = (update: (value: EpicFields) => void) => {
    const value: EpicFields = structuredClone(fieldsEntry ?? { epicId, epicTitle: known.get(epicId) ?? '', fields: [] })
    update(value); epicSetup.setDraft(upsertEpicFields(epicFile, value)); setResult(null)
  }
  function toggle(section: Section, on: boolean) {
    if (section === 'fields') {
      if (on) changeFields((value) => { if (!value.fields.length) value.fields.push({ label: 'Program', type: 'text', ifEmpty: 'optional', into: 'title' }) })
      else if (window.confirm(`Remove the Feature fields of ${title}? New Features under it then ask only for the title.`)) epicSetup.setDraft({ ...epicFile, epics: epicFile.epics.filter((item) => item.epicId !== epicId) })
      return
    }
    const field = sectionField[section]
    changeEntry((value) => {
      const inherits = new Set(value.inherits ?? [])
      if (on) {
        inherits.delete(field)
        // Start from what applies now, to edit.
        if (field === 'featureDoD') value.featureDoD = dod
        if (field === 'stories') value.stories = structuredClone(resolved?.stories ?? defaults.stories ?? [])
        if (field === 'estimate') { if (estimate != null) value.task.originalEstimate = estimate; else delete value.task.originalEstimate }
      } else inherits.add(field)
      value.inherits = [...inherits]
    })
  }
  const setStories = (next: StoryTemplate[]) => {
    if (isAll) changeDefaults((item) => { if (next.length) item.stories = next; else delete item.stories })
    else if (own) changeEntry((item) => { item.classSets![ownKey!].stories = next })
    else changeEntry((item) => { item.stories = next })
  }
  // STT-01 / STT-02: User Story templates — picked here (linked), or a story saved as one (tagged with this Epic and value).
  const allTemplates = epicFile.storyTemplates ?? []
  const offered = isAll ? allTemplates.filter((item) => !item.epics.length && !item.classes.length) : templatesFor(epicFile, epicId, value)
  const canTemplates = writable && can('setup.values')
  const saveAsTemplate = (index: number) => {
    const story = stories[index], id = newStoryTemplateId(epicFile, story.title)
    epicSetup.setDraft(upsertStoryTemplate(epicFile, { id, title: story.title.trim(), description: story.description, epics: isAll ? [] : [epicId], classes: value ? [value] : [] }))
    setStories(stories.map((item, at) => at === index ? { ...item, templateId: id } : item))
    setResult({ tone: 'success', text: `Saved “${story.title.trim()}” as a template, linked here — Save to Git to keep it.` })
  }
  // A value's own set: on, it starts from what applies to the value now; off, the value uses the Epic's default again.
  const toggleValue = (on: boolean) => {
    if (on) changeEntry((item) => { item.classSets = { ...(item.classSets ?? {}), [value]: { featureDoD: '', stories: structuredClone(stories) } } })
    else if (window.confirm(`Use the Epic’s default DoD and User Stories for ${value} again? Save to keep it.`)) changeEntry((item) => { const next = { ...(item.classSets ?? {}) }; delete next[ownKey!]; if (Object.keys(next).length) item.classSets = next; else delete item.classSets })
  }

  async function save() {
    const missingDoD = [...(dirtyShared ? sharedFile.epics : []), ...(dirtyPersonal ? personalFile.epics : [])].filter((item) => !(item.inherits ?? []).includes('featureDoD') && !item.featureDoD.trim())
    if (missingDoD.length) { setResult({ tone: 'error', text: `Not saved: give Epic ${missingDoD.map((item) => `#${item.epicId}`).join(', ')} a Definition of Done, or switch off “Customize for this Epic”.` }); return }
    setBusy(true)
    try {
      if (dirtyEpic) await epicSetup.save(epicSetup.draft!, `Update the Epic setup (${title})`)
      if (dirtyShared) { await setup.saveShared(shared!, `Update the Feature setup (${title})`); setShared(null) }
      if (dirtyPersonal) { await setup.savePersonal(personal!, `Update my Feature setup (${title})`); setPersonal(null) }
      setResult({ tone: 'success', text: 'Saved to Git.' })
    } catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  const discard = () => { setShared(null); setPersonal(null); epicSetup.setDraft(null); setResult(null) }
  const pick = (id: number) => { setEpicId(id); setMine(false); setCopyTo([]); setCls(''); setResult(null) }

  // The preview: an example Feature from the Epic's fields (first list value, else the field's name).
  const listsById = new Map(epicFile.lists.map((list) => [list.id, list]))
  const sample = (fieldsEntry?.fields ?? []).map((field, index) => index === classes.fieldIndex && value ? value : field.type === 'list' ? listsById.get(field.list ?? '')?.values[0] ?? field.label : field.label)
  const fromFields = fieldsEntry?.fields.length ? featureFromFields(fieldsEntry, sample, 'Feature title') : undefined
  const preview = {
    title: fromFields?.title || 'The title typed in New Feature',
    description: [dod ? `Feature DoD: ${dod}` : 'Feature DoD: (typed in New Feature)', ...(fromFields?.lines ?? [])].join('\n'),
    stories: stories.map((story) => story.title).join(' · ') || 'None',
    classification: value ? `${value}${own ? ' (its own set)' : ' (the Epic’s default)'}` : '',
    task: `${estimate != null ? `${estimate} h` : 'No default estimate'} · “<Month> | <Feature>” under “<Feature> - Time Writing”`,
  }
  const switchView = (section: Section, label: string) => !isAll && <button type="button" role="switch" aria-checked={custom[section]} aria-label={`Customize ${label} for this Epic`} className="efe-switch" disabled={section === 'fields' ? !canFields || useMine : !editable} onClick={() => toggle(section, !custom[section])}><span className="efe-track" data-on={custom[section]}><span /></span>Customize for this Epic</button>
  const fromDefaults = (text: string) => <div className="efe-inherited"><small>FROM ALL EPICS</small><span>{text}</span></div>

  return <div className="efe">
    <nav className="efe-epics" aria-label="Epics">
      <label>Search Epics<input type="search" value={find} placeholder="Epic or number" onChange={(event) => setFind(event.target.value)} /></label>
      <button type="button" aria-current={isAll} className="efe-epic" onClick={() => pick(0)}><span><strong>All Epics</strong><small>Defaults for every Epic</small></span><span className="efe-badge efe-badge-all">Defaults</span></button>
      {epics.map((epic) => <button key={epic.id} type="button" aria-current={epic.id === epicId} className="efe-epic" onClick={() => pick(epic.id)}>
        <span><strong>{epic.title || `Epic #${epic.id}`}</strong><small>#{epic.id}{epic.mineToo ? ' · my version' : ''}</small></span>
        <span className={`efe-badge${epic.count ? ' efe-badge-custom' : ''}`}>{epic.count ? `${epic.count} of 4 customized` : 'Uses defaults'}</span>
      </button>)}
      {!epics.length && <p className="muted">Load the QMS-0025 board to list its Epics.</p>}
    </nav>

    <div className="efe-main">
      <div className="efe-head">
        <h2>{title}</h2>
        {!isAll && <button type="button" role="switch" aria-checked={useMine} className="efe-switch" disabled={!setup.email} title={setup.email ? undefined : 'Set your work email (My settings) to keep your own version'} onClick={() => setMine(!mine)}><span className="efe-track" data-on={useMine}><span /></span>Use my own version (only me)</button>}
      </div>
      {!git.connected && <Notice tone="info">Connect Git storage (Admin → Data &amp; sharing) to change the setup; the one last loaded here is shown.</Notice>}
      {git.connected && !editable && <Notice tone="info">{git.readOnly ? 'View only: your Git token can read but not save.' : useMine ? 'Set your work email to keep your own version.' : 'View only: your role is not allowed “Edit the shared Feature setup”.'}</Notice>}
      {useMine && <Notice tone="warning">Your own version of {title}: only you see it when you create Features. What you don’t customize comes from the shared setup.</Notice>}

      <section className="efe-preview" aria-label="Preview">
        <small>A NEW FEATURE HERE LOOKS LIKE</small>
        <dl>{preview.classification && <><dt>{classes.label}</dt><dd>{preview.classification}</dd></>}<dt>Title</dt><dd>{preview.title}</dd><dt>Description</dt><dd className="efe-pre">{preview.description}</dd><dt>User Stories</dt><dd>{preview.stories}</dd><dt>Month Task</dt><dd>{preview.task}</dd></dl>
      </section>

      {!isAll && <section className="efe-section" aria-label="Fields and title">
        <header><span className="efe-n">1</span><div><h3>Fields &amp; title</h3><small>What New Feature asks for, and how the title is built</small></div>{switchView('fields', 'Fields and title')}</header>
        {useMine && <small className="muted">Fields are shared by everyone; switch off “Use my own version” to change them.</small>}
        {!custom.fields ? <div className="efe-inherited"><small>NO EXTRA FIELDS</small><span>New Feature asks only for the title.</span></div> : <FieldsEditor entry={fieldsEntry!} file={epicFile} disabled={!canFields || useMine} onChange={changeFields} />}
        {custom.fields && canFields && !useMine && <details className="efe-copy"><summary>Copy fields to other Epics…</summary>
          <div className="efe-copy-list">{[...known.entries()].filter(([id]) => id !== epicId).map(([id, name]) => <label key={id} className="inline-check"><input type="checkbox" checked={copyTo.includes(id)} onChange={(event) => setCopyTo((now) => event.target.checked ? [...now, id] : now.filter((item) => item !== id))} />#{id} {name}</label>)}</div>
          <button type="button" className="ghost" disabled={!copyTo.length} onClick={() => { epicSetup.setDraft(copyEpicFields(epicFile, epicId, [...known.entries()].filter(([id]) => copyTo.includes(id)).map(([id, name]) => ({ id, title: name })))); setCopyTo([]); setResult({ tone: 'success', text: 'Copied — Save to keep it.' }) }}>Copy to {copyTo.length || ''} Epic{copyTo.length === 1 ? '' : 's'}</button>
        </details>}
      </section>}

      {!isAll && classes.values.length > 0 && <section className="efe-classes" aria-label={`By ${classes.label}`}>
        <div><strong>DoD and User Stories by {classes.label}</strong><small>The values of this Epic’s {classes.label} field. A value without its own set uses the Epic’s default.</small></div>
        <div role="tablist" aria-label={classes.label} className="efe-tabs">
          <button type="button" role="tab" aria-selected={!value} onClick={() => setCls('')}>Epic default</button>
          {classes.values.map((item) => <button key={item} type="button" role="tab" aria-selected={value === item} onClick={() => setCls(item)}>{item}{classSetKey(entry, item) ? ' ●' : ''}</button>)}
        </div>
        {value && <div className="efe-classhead"><button type="button" role="switch" aria-checked={Boolean(own)} aria-label={`Own DoD and User Stories for ${value}`} className="efe-switch" disabled={!editable} onClick={() => toggleValue(!own)}><span className="efe-track" data-on={Boolean(own)}><span /></span>Own DoD and User Stories for {value}</button>
          {!own && <small className="muted">Now: the Epic’s default.</small>}</div>}
      </section>}

      <section className="efe-section" aria-label="Definition of Done">
        <header><span className="efe-n">{isAll ? 1 : 2}</span><div><h3>Definition of Done{value && ` — ${value}`}</h3><small>Written at the top of the Feature’s Description</small></div>{!value && switchView('dod', 'Definition of Done')}</header>
        {value ? own ? <label className="efe-field">Definition of Done for {value}<textarea rows={2} value={own.featureDoD} disabled={!editable} placeholder={`Empty: the Epic’s DoD (${resolved?.featureDoD || 'none'})`} onChange={(event) => changeEntry((item) => { item.classSets![ownKey!].featureDoD = event.target.value })} /></label>
          : <div className="efe-inherited"><small>FROM THE EPIC’S DEFAULT</small><span>{dod || '—'}</span></div>
        : !isAll && !custom.dod ? fromDefaults(defaults.featureDoD || 'None set: typed in New Feature') : <label className="efe-field">Definition of Done{!isAll && ' (required)'}<textarea rows={2} value={isAll ? defaults.featureDoD ?? '' : entry?.featureDoD ?? ''} disabled={!editable} onChange={(event) => isAll ? changeDefaults((value) => { if (event.target.value.trim()) value.featureDoD = event.target.value; else delete value.featureDoD }) : changeEntry((value) => { value.featureDoD = event.target.value })} placeholder={isAll ? 'Empty: typed in New Feature' : ''} /></label>}
      </section>

      <section className="efe-section" aria-label="User Stories">
        <header><span className="efe-n">{isAll ? 2 : 3}</span><div><h3>User Stories{value && ` — ${value}`}</h3><small>Created under the Feature, ticked by default</small></div>{!value && switchView('stories', 'User Stories')}</header>
        {value && !own ? <div className="efe-inherited"><small>FROM THE EPIC’S DEFAULT</small><span>{stories.map((story) => story.title).join('\n') || 'None'}</span></div>
        : !value && !isAll && !custom.stories ? fromDefaults((defaults.stories ?? []).map((story) => story.title).join('\n') || 'None set: only the Review of Deliverables story and your own') : <>
          <StoriesEditor stories={stories} disabled={!editable} onChange={setStories} templates={allTemplates} offered={offered} canSaveTemplate={canTemplates} onSaveTemplate={saveAsTemplate} />
          {hasSets && entry && !value && <div className="form-row">
            <label>QE Mapping column with the Platform / Product{qeColumnNames.length ? <select value={entry.qeColumns?.matchColumn ?? ''} disabled={!editable} onChange={(event) => changeEntry((value) => { value.qeColumns = { matchColumn: event.target.value, qeColumn: value.qeColumns?.qeColumn ?? '' } })}><option value="">Not set</option>{qeColumnNames.map((name) => <option key={name}>{name}</option>)}</select> : <small className="muted">Open QE Mapping once to list its columns.</small>}</label>
            <label>QE Mapping column with the QE{qeColumnNames.length ? <select value={entry.qeColumns?.qeColumn ?? ''} disabled={!editable} onChange={(event) => changeEntry((value) => { value.qeColumns = { matchColumn: value.qeColumns?.matchColumn ?? '', qeColumn: event.target.value } })}><option value="">Not set</option>{qeColumnNames.map((name) => <option key={name}>{name}</option>)}</select> : null}</label>
          </div>}
        </>}
      </section>

      <section className="efe-section" aria-label="Month Task">
        <header><span className="efe-n">{isAll ? 3 : 4}</span><div><h3>Month Task</h3><small>The Time Writing Task’s default estimate</small></div>{switchView('task', 'Month Task')}</header>
        {!isAll && !custom.task ? fromDefaults(defaults.originalEstimate != null ? `${defaults.originalEstimate} hours` : 'No default estimate') : <label className="efe-field efe-inline">Default Original Estimate<input type="number" min="0" max="1000000" step="0.25" value={(isAll ? defaults.originalEstimate : entry?.task.originalEstimate) ?? ''} disabled={!editable} onChange={(event) => { const raw = event.target.value.trim(), hours = raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0 ? undefined : Number(raw); if (isAll) changeDefaults((value) => { if (hours == null) delete value.originalEstimate; else value.originalEstimate = hours }); else changeEntry((value) => { if (hours == null) delete value.task.originalEstimate; else value.task.originalEstimate = hours }) }} />hours</label>}
      </section>

      {!isAll && <section className="efe-section" aria-label="Complete children">
        <header><span className="efe-n">5</span><div><h3>Complete children</h3><small>Offered on this Epic’s Features — a team setting (shared setup)</small></div></header>
        <label className="checkbox-label"><input type="checkbox" checked={completeChildrenHere} disabled={!canShared} onChange={(event) => setCompleteChildren(event.target.checked)} />Offer “Complete children” on the Features of this Epic</label>
        <small className="muted">{completeChildrenHere ? 'A Feature without optional User Stories shows Complete children; its pop-up lists this Epic’s User Stories, none ticked, so the person decides which to add.' : 'Hidden on this Epic’s Features; single User Stories are still added with ＋ User Story.'}</small>
      </section>}

      {!isAll && entry && editable && <div className="button-row"><button type="button" className="text-button danger-text" onClick={() => { if (!window.confirm(`${useMine ? 'Remove your own version of' : 'Reset'} ${title}${useMine ? '' : ' to the defaults'}? Save to keep it.`)) return; putLayer({ ...layerFile, epics: layerFile.epics.filter((item) => item.epicId !== epicId) }) }}>{useMine ? 'Remove my own version' : 'Reset this Epic to the defaults'}</button>
        {useMine && can('setup.feature') && canShared && <button type="button" className="ghost" onClick={() => { const next = structuredClone(sharedFile); next.epics = [...next.epics.filter((item) => item.epicId !== epicId), structuredClone(entry)]; setShared(next); setResult({ tone: 'success', text: 'Your version will be the shared one — Save to keep it.' }) }}>Share my version with everyone</button>}
      </div>}

      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </div>
    {dirty && <div className="efe-savebar" role="region" aria-label="Unsaved changes"><span><strong>Unsaved changes</strong> — one save for fields, DoD, stories and Task</span><button type="button" className="ghost" disabled={busy} onClick={discard}>Discard</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to Git'}</button></div>}
  </div>
}

function StoriesEditor({ stories, disabled, onChange, templates, offered, canSaveTemplate, onSaveTemplate }: { stories: StoryTemplate[]; disabled: boolean; onChange: (next: StoryTemplate[]) => void; templates: StoryTemplateItem[]; offered: StoryTemplateItem[]; canSaveTemplate: boolean; onSaveTemplate: (index: number) => void }) {
  const set = (index: number, update: Partial<StoryTemplate>) => onChange(stories.map((story, at) => at === index ? { ...story, ...update } : story))
  const used = new Set(stories.map((story) => story.templateId).filter(Boolean))
  const others = templates.filter((item) => !offered.some((entry) => entry.id === item.id) && !used.has(item.id))
  const add = (id: string) => { const item = templates.find((entry) => entry.id === id); if (item) onChange([...stories, { title: item.title, description: item.description, templateId: item.id }]) }
  return <div className="efe-list">
    {stories.map((story, index) => {
      const linked = story.templateId ? templates.find((item) => item.id === story.templateId) : undefined
      const tools = !disabled && <><button type="button" className="text-button" aria-label={`Move User Story ${index + 1} up`} disabled={index === 0} onClick={() => { const next = [...stories]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }}>↑</button><button type="button" className="text-button danger-text" aria-label={`Remove User Story ${index + 1}`} onClick={() => onChange(stories.filter((_, at) => at !== index))}>Remove</button></>
      return <div key={index} className="efe-story">
        <div className="efe-row">
          <span className="efe-num">{index + 1}</span>
          {linked ? <span className="efe-linked" aria-label={`User Story ${index + 1} from template`}><span>{linked.title}</span><small className="efe-badge efe-badge-custom">Template</small></span>
            : <input aria-label={`User Story ${index + 1} title`} value={story.title} maxLength={255} disabled={disabled} onChange={(event) => set(index, { title: event.target.value })} />}
          {!disabled && linked && <button type="button" className="text-button" title="Keep a copy here that no longer follows the template" onClick={() => set(index, { title: linked.title, description: linked.description, templateId: undefined })}>Unlink</button>}
          {!disabled && !linked && canSaveTemplate && story.title.trim() && <button type="button" className="text-button" onClick={() => onSaveTemplate(index)}>Save as template</button>}
          {tools}
        </div>
        {linked ? linked.description && <p className="muted efe-desc-text">{linked.description}</p>
          : <details className="efe-desc"><summary>{story.description ? 'Description' : 'Add a description'}{story.templateId ? ' · template removed, kept as a copy' : ''}</summary><textarea aria-label={`User Story ${index + 1} description`} rows={2} value={story.description} disabled={disabled} onChange={(event) => set(index, { description: event.target.value })} /></details>}
      </div>
    })}
    {!stories.length && <p className="muted">No User Stories: only the Time Writing story and Task are created.</p>}
    {!disabled && <div className="button-row"><button type="button" className="ghost efe-add" onClick={() => onChange([...stories, { title: '', description: '' }])}>＋ Add User Story</button>
      {(offered.length > 0 || others.length > 0) && <select aria-label="Add from templates" className="efe-add" value="" onChange={(event) => { if (event.target.value) add(event.target.value) }}><option value="">＋ Add from templates…</option>
        {offered.filter((item) => !used.has(item.id)).length > 0 && <optgroup label="For this Epic and value">{offered.filter((item) => !used.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>}
        {others.length > 0 && <optgroup label="Other templates">{others.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>}
      </select>}</div>}
  </div>
}

function FieldsEditor({ entry, file, disabled, onChange }: { entry: EpicFields; file: EpicSetupFile; disabled: boolean; onChange: (update: (value: EpicFields) => void) => void }) {
  const edit = (index: number, update: Partial<EpicField>) => onChange((value) => { value.fields[index] = { ...value.fields[index], ...update }; if (value.fields[index].type !== 'list') delete value.fields[index].list })
  return <div className="efe-list">
    {entry.fields.map((field, index) => <div key={index} className="efe-fieldrow">
      <label>Field<input aria-label={`Field ${index + 1} label`} value={field.label} maxLength={60} disabled={disabled} onChange={(event) => edit(index, { label: event.target.value })} /><small className="muted">{'{'}{fieldKey(field.label)}{'}'}</small></label>
      <label>Type<select aria-label={`${field.label} type`} value={field.type} disabled={disabled} onChange={(event) => edit(index, { type: event.target.value as EpicField['type'] })}>{fieldTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></label>
      {field.type === 'list' ? <label>Values<select aria-label={`${field.label} list`} value={field.list ?? ''} disabled={disabled} onChange={(event) => edit(index, { list: event.target.value || undefined })}><option value="">Choose a list…</option>{file.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
        : <label>On-prem field<input aria-label={`${field.label} on-prem field`} value={field.source ?? ''} placeholder="optional → drop-down" disabled={disabled} onChange={(event) => edit(index, { source: event.target.value || undefined })} /></label>}
      <label>If empty<select aria-label={`${field.label} if empty`} value={field.ifEmpty} disabled={disabled} onChange={(event) => edit(index, { ifEmpty: event.target.value as EpicField['ifEmpty'] })}>{ifEmptyOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <label>Goes into<select aria-label={`${field.label} goes into`} value={field.into} disabled={disabled} onChange={(event) => edit(index, { into: event.target.value as EpicField['into'] })}>{intoOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      {!disabled && <button type="button" className="text-button danger-text" aria-label={`Remove ${field.label}`} onClick={() => onChange((value) => { value.fields.splice(index, 1) })}>Remove</button>}
    </div>)}
    {!disabled && <button type="button" className="ghost efe-add" disabled={entry.fields.length >= maxEpicFields} onClick={() => onChange((value) => { value.fields.push({ label: '', type: 'text', ifEmpty: 'optional', into: 'description' }) })}>＋ Add field</button>}
    <label className="efe-field">Title pattern<input aria-label="Title pattern" value={entry.titlePattern ?? ''} disabled={disabled} placeholder={entry.fields.filter((field) => field.into !== 'description').map((field) => `{${fieldKey(field.label)}}`).join(' | ') || 'e.g. {program} | {feature}'} onChange={(event) => onChange((value) => { if (event.target.value.trim()) value.titlePattern = event.target.value; else delete value.titlePattern })} /></label>
  </div>
}
