import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { mergeAzureWorkItems, completeFeatureFromSetup, createFeatureFromSetup, addMonthTasks, addUserStory, updateAzureTimeWritingEffort,  utcMonthLabel, HierarchyCreationError, withFeatureDoD, readAzureIterations, currentIterationPairs, futureIterationPairs, type AzureIteration, type AzureConfig, type FeatureInput } from '../azureDevOps'
import { Modal, Info, Notice } from './ui'
import { PersonPicker } from './PersonPicker'
import { assignablePeople } from '../myWork'
import { runInBackground } from '../backgroundJobs'
import { adhocAfterLock } from '../planningLock'
import { featureMonths, isFutureMonth } from '../featureMonths'
import { useEpicSetupFile } from '../useEpicSetup'
import { onPremValues, useOnPremSources } from '../onPremValues'
import { asTitleFields, epicFieldsFor, featureFromFields, listOf, offList } from '../epicSetup'
import { chooseSetup, setForClass, withLinkedStories, emptySetup, fieldKey, fieldLines, fieldPlaceholders, fieldTitle, fieldsFromItems, fieldsFromTitle, fillTitle, missingValues, reviewStoryTitle, setupFor, titleValues, type FeatureSetups } from '../featureSetup'

// The "Add Feature under an Epic" / "Complete Feature children" modal, shared by the QMS-0025 board and Assigned to
// Me. mode.parent: create a Feature (the Epic can still be changed) with its children; mode.resume: add the missing
// children of an existing Feature. The Feature and every new child are assigned to the person chosen, else to me.
// initialTitle: the Feature title to start from (Release Details: "Program | Service | Release" of the release).
// releaseItems: the on-prem work items of that release; they fill the Epic setup's title fields (their source field).
// month: the Time Writing month of the new Task (Time Writing: the month shown); default the current month (UTC, NAV-51).
// Every new Feature, from any page, is created here (BKL-26): the Epic's setup (else the built-in rules), the Epic's
// Area Path, the PI chosen (the current one preselected) and the stories in its Sprint.
export type FeatureEditorMode = { parent: AzureWorkItem; resume?: undefined } | { resume: AzureWorkItem; parent?: undefined }
export interface FeatureEditorResult { feature: AzureWorkItem; items: AzureWorkItem[]; text: string; parent?: AzureWorkItem }
export function FeatureEditor({ mode, items, config, savedPat = '', me, canChoose, featureSetup, initialTitle = '', releaseItems, month, onSavePat, onCreated, onDone, onPartial, onClose }: { mode: FeatureEditorMode; initialTitle?: string; month?: string; releaseItems?: AzureWorkItem[]; items: AzureWorkItem[]; config: AzureConfig; savedPat?: string; me: string; canChoose: boolean; featureSetup?: FeatureSetups | null; onSavePat?: (pat: string) => void; onCreated?: (items: AzureWorkItem[]) => void; onDone: (result: FeatureEditorResult) => void; onPartial: (text: string, items: AzureWorkItem[], parent?: AzureWorkItem) => void; onClose: () => void }) {
  const people = useMemo(() => assignablePeople(items), [items])
  const resumeFeature = mode.resume ?? null
  const scoped = useMemo(() => items.filter((item) => item.state.trim().toLowerCase() !== 'removed' && item.organization.toLowerCase() === config.organization.toLowerCase() && item.project.toLowerCase() === config.project.toLowerCase()), [items, config.organization, config.project])
  const epics = scoped.filter((item) => item.workItemType === 'Epic').sort((a, b) => a.id - b.id)
  // A new Feature: the Parent Epic starts blank on every opening and is chosen in the form (BKL-23); the Epic the form
  // was opened from is only offered in the list.
  const isNew = !resumeFeature
  const epicOptions = mode.parent && !epics.some((epic) => epic.key === mode.parent!.key) ? [mode.parent, ...epics] : epics
  const [parent, setParent] = useState<AzureWorkItem | null>(null)
  const [assigneeName, setAssigneeName] = useState(() => resumeFeature && canChoose ? people.find((person) => person.email === resumeFeature.assignedToEmail && person.email !== me)?.name ?? '' : '')
  const assignee = canChoose && assigneeName ? people.find((person) => person.name === assigneeName)?.email ?? '' : me
  const [titleText, setTitleText] = useState(resumeFeature?.title ?? initialTitle)
  // With title fields in the Epic's setup the title follows them until it is typed over.
  const [titleTyped, setTitleTyped] = useState(Boolean(resumeFeature))
  const [typedFields, setTypedFields] = useState<Record<string, string>>({})
  // The Feature DoD is mandatory: it starts from the Epic's setup, else the PU / Full Release default, until typed.
  const [dodText, setDodText] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  // BKL-31 / BKL-32: Start Date and Target date decide the months of the Time Writing Tasks; hours are asked per month.
  const [startDate, setStartDate] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [monthHours, setMonthHours] = useState<Record<string, { plan: string; done: string }>>({})
  const [iterationPath, setIterationPath] = useState('')
  const [sprintPath, setSprintPath] = useState('')
  const [iterationChoices, setIterationChoices] = useState<AzureIteration[]>([])
  const [iterationLoading, setIterationLoading] = useState(false)
  const [pat, setPat] = useState(savedPat)
  const [creating, setCreating] = useState(false)
  // BKL-25: a User Story of the person's own (title, description) created under the new Feature, in the Sprint chosen.
  const [ownStory, setOwnStory] = useState({ title: '', description: '', comment: '' })
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const pairs = currentIterationPairs(iterationChoices)
  const futurePairs = futureIterationPairs(iterationChoices)
  const selectablePairs = [...pairs, ...futurePairs]
  const todayMonth = utcMonthLabel()
  const baseMonth = month || todayMonth
  let months: string[] = [baseMonth], monthsError = ''
  if (!resumeFeature) { try { months = featureMonths({ startDate, targetDate, formMonth: baseMonth, currentMonth: todayMonth }) } catch (failure) { monthsError = failure instanceof Error ? failure.message : 'Check the dates.' } }
  // The first month's Task is created with the hierarchy; the later ones follow (BKL-32).
  const monthLabel = months[0]
  const hoursOf = (label: string) => monthHours[label] ?? { plan: '', done: '' }
  const setHours = (label: string, change: Partial<{ plan: string; done: string }>) => setMonthHours((now) => ({ ...now, [label]: { ...(now[label] ?? { plan: '', done: '' }), ...change } }))
  const taskOriginalEstimate = hoursOf(monthLabel).plan, taskCompletedWork = isFutureMonth(monthLabel, todayMonth) ? '' : hoursOf(monthLabel).done
  // Planning of the month has locked (Admin → Capacity & time → Period control): the new Time Writing Task is tagged ad-hoc.
  const lateTask = adhocAfterLock(monthLabel)
  // The Epic's own setup (Admin → Epic & Feature setup → Feature setup), if any: its optional User Stories replace the PU / Full Release
  // milestones (all ticked by default) and its Task defaults apply.
  // My own setup of the Epic first, else the shared one; the switch below picks the shared one instead.
  const [preferShared, setPreferShared] = useState(false)
  const epicId = parent?.id ?? resumeFeature?.parentId
  const { setup: unlinkedSetup, source: setupSource } = chooseSetup(featureSetup, epicId, preferShared)
  // EPS-02: the Epic setup's fields (Admin → Epic & Feature setup) apply to every new Feature under the Epic and take the place
  // of the Feature setup's title fields.
  const epicFile = useEpicSetupFile()
  // STT-02: stories linked to a User Story template take its current title and description.
  const baseSetup = withLinkedStories(unlinkedSetup, epicFile?.storyTemplates)
  const onPremSources = useOnPremSources()
  const epicEntry = resumeFeature ? undefined : epicFieldsFor(epicFile, epicId)
  const titleFields = resumeFeature || !epicEntry ? [] : asTitleFields(epicEntry.fields)
  const bothSetups = Boolean(setupFor(featureSetup?.personal ?? null, epicId) && setupFor(featureSetup?.shared ?? null, epicId))
  // Title fields in the other setup of the Epic (mine vs shared) only: say so, with a switch, instead of hiding them.
  const otherSetup = bothSetups ? chooseSetup(featureSetup, epicId, !preferShared).setup : undefined
  const fieldsElsewhere = !resumeFeature && !epicEntry && !titleFields.length && Boolean(otherSetup?.titleFields?.length)
  const fromRelease = releaseItems?.length ? fieldsFromItems(titleFields, releaseItems) : [], fromTitle = fieldsFromTitle(titleFields, initialTitle)
  const fieldValues = titleFields.map((field, index) => typedFields[fieldKey(field.label)] ?? (fromRelease[index] || fromTitle[index] || ''))
  // DPF-07, BKL-33: the Release Classification chosen in the Epic setup's own field (there is no built-in picker) picks the DoD and
  // User Stories set for that value, else the Epic's default.
  const classField = epicEntry ? epicEntry.fields.findIndex((field) => fieldKey(field.label) === 'releaseclassification') : -1
  const classValue = classField >= 0 ? fieldValues[classField] ?? '' : ''
  const classSet = setForClass(baseSetup, classValue)
  // DPF-09: an Epic without a setup gets no built-in PU / Full Release stories or DoD: an empty setup (the Review of
  // Deliverables story and your own story only; the DoD is typed).
  const epicSetup = baseSetup && classSet ? { ...baseSetup, featureDoD: classSet.featureDoD, stories: classSet.stories } : baseSetup ?? (epicId != null ? emptySetup(epicId) : undefined)
  // With an Epic setup the Title follows its pattern or its Title fields; fields that go only into the Description leave the typed title.
  const fromFields = epicEntry ? featureFromFields(epicEntry, fieldValues, titleText) : undefined
  const fieldsMakeTitle = epicEntry ? Boolean(epicEntry.titlePattern || epicEntry.fields.some((field) => field.into !== 'description')) : titleFields.length > 0
  const title = fieldsMakeTitle && !titleTyped ? (fromFields ? fromFields.title : fieldTitle(fieldValues)) : titleText
  const offListFields = epicEntry ? offList(epicEntry, fieldValues, epicFile) : []
  const setTitle = (value: string) => { setTitleText(value); setTitleTyped(true) }
  // BKL-38: Complete children lists the Epic's User Stories unticked: the person decides which to add.
  const [skipStories, setSkipStories] = useState<number[]>(() => resumeFeature && epicSetup ? epicSetup.stories.map((_, index) => index) : [])
  // The built-in "Review of Deliverables - <Feature>" story: optional, in the Sprint chosen. It and the milestone /
  // optional stories exclude each other: ticking one side clears the other. By default the stories are ticked and it
  // is not, unless there are no stories to tick.
  const [reviewChoice, setReviewChoice] = useState<boolean | null>(null)
  // A different classification offers other stories: start their choice afresh.
  const [storiesOf, setStoriesOf] = useState(classValue)
  if (storiesOf !== classValue) { setStoriesOf(classValue); setSkipStories([]); setReviewChoice(null); setDodText(null) }
  const reviewStory = reviewChoice ?? (epicSetup ? epicSetup.stories.length === 0 : true)
  const chooseReview = (checked: boolean) => { setReviewChoice(checked); if (checked) { setSkipStories(epicSetup ? epicSetup.stories.map((_, index) => index) : []) } }
  const storiesChosen = (count: number) => { if (count > 0) setReviewChoice(false) }
  const dod = dodText ?? (epicSetup ? epicSetup.featureDoD.trim() : '')
  const needsDoD = isNew
  const values = { ...titleValues(title, monthLabel, titleFields), ...(titleFields.length ? fieldPlaceholders(titleFields, fieldValues) : {}) }
  const filled = (template: string) => { const missing = missingValues(template, values); return missing.length ? `${template} (needs ${titleFields.length ? missing.map((key) => titleFields.find((field) => fieldKey(field.label) === key)?.label ?? key).join(', ') : '“Program | Service | Release”'})` : fillTitle(template, values) }
  // The saved PAT loads the PI / Sprint schedule as soon as the editor opens.
  useEffect(() => { if (savedPat) void loadIterations(savedPat) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  function closeEditor() { if (submitting.current) return; onClose() }

  async function loadIterations(token = pat || savedPat) {
    setError(''); setIterationLoading(true)
    try {
      const options = await readAzureIterations(config, token)
      setIterationChoices(options)
      const current = currentIterationPairs(options), future = futureIterationPairs(options)
      if (current.length === 1) { setIterationPath(current[0].pi.path); setSprintPath(current[0].sprint.path) }
      else if (!current.length && future.length === 1) { setIterationPath(future[0].pi.path); setSprintPath(future[0].sprint.path) }
      else { setIterationPath(''); setSprintPath(''); setError(current.length ? 'Several current PI/Sprint branches overlap. Select the correct team schedule below.' : future.length ? 'No current dated Sprint was found. Select one future PI/Sprint below.' : 'No current or future dated PI → Sprint pair found. Check start/finish dates and nesting in Azure Project settings, then reload.') }
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to load iteration paths.') }
    finally { setIterationLoading(false) }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    if (isNew && !parent) { setError('Choose the parent Epic.'); return }
    if (monthsError) { setError(monthsError); return }
    if (fromFields?.blocked.length) { setError(`Fill ${fromFields.blocked.join(', ')}: the Epic setup of #${epicId} needs ${fromFields.blocked.length === 1 ? 'it' : 'them'} (Admin → Epic & Feature setup).`); return }
    const data = new FormData(event.currentTarget)
    const token = pat; setError(''); submitting.current = true; setCreating(true)
    const parseHours = (value: string, label: string) => { if (!value.trim()) return undefined; const hours = Number(value); if (!Number.isFinite(hours) || hours < 0 || hours > 1000000) throw new Error(`${label} must be a number from 0 to 1,000,000.`); return hours }
    let feature: FeatureInput
    try { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) throw new Error(me ? 'Choose who the Feature and its children are assigned to.' : 'Configure the Feature creator email in Azure DevOps settings before creating a Feature.'); feature = { parentId: parent?.id ?? 0, title: title.trim(), description: needsDoD ? withFeatureDoD(dod, String(data.get('description') ?? ''), undefined, (fromFields ? fromFields.lines : fieldLines(titleFields, fieldValues))) : '', acceptanceCriteria: String(data.get('acceptance') ?? ''), areaPath: String(data.get('areaPath') ?? ''), iterationPath, assignedTo: assignee, storyIterationPath: sprintPath, ...(isNew && startDate ? { startDate } : {}), targetDate, taskOriginalEstimate: parseHours(taskOriginalEstimate, 'Original Estimate'), taskCompletedWork: parseHours(taskCompletedWork, 'Completed Work') } }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid Task effort.'); submitting.current = false; setCreating(false); return }
    // The months after the first one, with the hours typed for each (none for a future month's Completed Work).
    let later: { month: string; originalEstimate?: number; completedWork?: number }[]
    try { later = months.slice(1).map((label) => ({ month: label, originalEstimate: parseHours(hoursOf(label).plan, `Original Estimate of ${label}`), completedWork: isFutureMonth(label, todayMonth) ? undefined : parseHours(hoursOf(label).done, `Completed Work of ${label}`) })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Invalid Task effort.'); submitting.current = false; setCreating(false); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) { setError('Choose who the work is assigned to.'); submitting.current = false; setCreating(false); return }
    onSavePat?.(token)
    // The writes run as a background job: the form closes at once and the top bar shows progress and the result.
    const label = resumeFeature ? `Complete children of #${resumeFeature.id}` : `New Feature “${feature.title}”`
    const started = runInBackground(`feature:${resumeFeature ? resumeFeature.id : `${parent?.id}:${feature.title.toLowerCase()}`}`, label, async (progress) => {
    try {
      progress('Checking the PI / Sprint…')
      const choices = await readAzureIterations(config, token)
      const fresh = [...currentIterationPairs(choices), ...futureIterationPairs(choices)]
      if (!fresh.some((pair) => pair.pi.path === iterationPath && pair.sprint.path === sprintPath)) throw new Error('The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted.')
      progress('Creating the Feature and its children…')
      // Checked again at Save: the lock may have passed while the form was open.
      const adhoc = adhocAfterLock(monthLabel)
      let bundle
      if (epicSetup) {
        const children = { stories: epicSetup.stories.filter((_, index) => !skipStories.includes(index)), reviewStory, titleFields: epicEntry ? titleFields : epicSetup.titleFields, ...(titleFields.length ? { fieldValues } : {}), timeWritingStory: epicSetup.timeWritingStory, task: { ...epicSetup.task, ...(feature.taskOriginalEstimate != null ? { originalEstimate: feature.taskOriginalEstimate } : {}) } }
        bundle = resumeFeature ? await completeFeatureFromSetup(config, token, resumeFeature.id, children, monthLabel, undefined, sprintPath, assignee, adhoc) : await createFeatureFromSetup(config, token, feature, children, monthLabel, undefined, adhoc)
        const task = bundle.items.find((item) => item.workItemType === 'Task')
        if (task && feature.taskCompletedWork != null) { const updated = await updateAzureTimeWritingEffort(config, token, task.id, undefined, feature.taskCompletedWork); bundle = { ...bundle, items: bundle.items.map((item) => item.id === task.id ? updated : item) } }
      } else throw new Error('Choose the parent Epic.')
      // BKL-32: one Task for every later month up to the Target date.
      if (later.length) {
        try {
          const added = await addMonthTasks(config, token, bundle.feature.id, assignee, later.map((entry) => ({ ...entry, adhoc: adhocAfterLock(entry.month) })), epicSetup?.task.originalEstimate, undefined, progress)
          bundle = { ...bundle, items: [...bundle.items, ...added] }
        } catch (failure) {
          const made = failure instanceof HierarchyCreationError ? failure.createdItems : []
          throw new HierarchyCreationError(`Feature #${bundle.feature.id} and its ${monthLabel} Task exist. ${failure instanceof Error ? failure.message : 'A later month Task failed.'} Add the missing months with ＋ Time Writing Task.`, mergeAzureWorkItems(bundle.items, made))
        }
      }
      let storyText = ''
      const own = { title: ownStory.title.trim(), description: ownStory.description.trim(), comment: ownStory.comment.trim() }
      if (own.title) {
        try {
          progress('Adding your User Story…')
          const { story, commentError } = await addUserStory(config, token, { parentId: bundle.feature.id, title: own.title, description: own.description, acceptanceCriteria: '', iterationPath: sprintPath, assignedTo: assignee, comment: own.comment })
          bundle = { ...bundle, items: [...bundle.items, story] }
          storyText = ` Your User Story #${story.id} “${story.title}” was added${own.comment && !commentError ? ', with your comment' : ''}.${commentError ? ` Its comment could not be added (${commentError}).` : ''}`
        } catch (failure) { storyText = ` Your User Story could not be added (${failure instanceof Error ? failure.message : 'failed'}); add it with New User Story.` }
      }
      onCreated?.(parent ? [parent, ...bundle.items] : bundle.items)
      const doneText = `Hierarchy complete: ${epicSetup ? epicSetup.stories.length - skipStories.length : 0} optional User Stories, ${reviewStory ? 'Review of Deliverables story, ' : ''}Time Writing story and ${months.length > 1 ? `${months.length} month Tasks (${monthLabel} – ${months[months.length - 1]})` : `${monthLabel} task`} verified${adhoc ? ' (a new Task is tagged ad-hoc: planning is locked)' : ''}.`
      onDone({ feature: bundle.feature, items: bundle.items, parent: parent ?? undefined, text: doneText })
      return { text: `#${bundle.feature.id} “${bundle.feature.title}”: ${doneText}${storyText}`, failed: storyText.includes('could not') }
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to create the hierarchy.'
      if (failure instanceof HierarchyCreationError && failure.createdItems.length) {
        onCreated?.(parent ? [parent, ...failure.createdItems] : failure.createdItems)
        onPartial(detail, failure.createdItems, parent ?? undefined)
        return { text: `${detail} ${failure.createdItems.length} item(s) were created; Complete Feature children adds the rest.`, failed: true }
      }
      return { text: `${detail} Nothing was created.`, failed: true }
    }
    })
    submitting.current = false; setCreating(false)
    if (!started) { setError('This Feature is already being created in the background (see the top bar).'); return }
    onClose()
  }

  // BKL-29: a new Feature is asked for on one page in four sections, in this order: 1 the Feature (Parent Epic, title,
  // assignee, PI → Sprint, classification, target date), 2 its DoD, 3 its User Stories, 4 the estimates of the month
  // Task. A section appears only when the sections before it are filled; the first one still to fill is highlighted
  // and says what is missing; Save is at the bottom. Completing children shows everything at once.
  // The saved PAT is used silently; the field shows only when none is saved (or on "Use another token").
  const [showPat, setShowPat] = useState(!savedPat)
  const childCount = (epicSetup ? epicSetup.stories.length - skipStories.length : 0) + (reviewStory ? 1 : 0) + 1 + months.length
  const pairLabel = (pair: { pi: AzureIteration; sprint: AzureIteration }) => `${pair.pi.name} → ${pair.sprint.name} (${pair.sprint.attributes?.startDate?.slice(5, 10)} – ${pair.sprint.attributes?.finishDate?.slice(5, 10)})`
  const monthRange = months.length > 1 ? `${monthLabel} – ${months[months.length - 1]}` : monthLabel
  const steps = ['Feature', 'Definition of Done', 'User Stories', `Estimates for ${monthRange}`]
  const featureMissing = [!parent && 'the Parent Epic', !title.trim() && 'the title', !sprintPath && 'the PI → Sprint', monthsError && 'valid dates'].filter(Boolean) as string[]
  // BKL-30: sections 2 and 3 count as done once the person presses Continue in them (an explicit step action, as in
  // stepped forms generally — not on leaving the box): the DoD usually starts filled and the stories are optional, so
  // being filled cannot tell that they were looked at. Continue shows the next section and moves the focus to it.
  const [left, setLeft] = useState<number[]>([])
  // The next section is focused once React has shown it (an effect after the render), never before: focusing a
  // still-hidden section does nothing.
  const [focusSection, setFocusSection] = useState<number | null>(null)
  useEffect(() => {
    if (focusSection == null) return
    document.querySelector<HTMLElement>(`form.nf-form section[aria-label^="Section ${focusSection}"]`)?.focus()
    setFocusSection(null) // eslint-disable-line react-hooks/set-state-in-effect
  }, [focusSection])
  const advance = (index: number) => {
    setLeft((now) => now.includes(index) ? now : [...now, index])
    setFocusSection(index + 2)
  }
  const stepMissing = [featureMissing, dod.trim() ? [] : ['the DoD'], [], []]
  const done = (index: number) => !stepMissing[index].length && (index === 0 || left.includes(index))
  const ready = (index: number) => [0, 1, 2].slice(0, index).every(done)
  const wizard = isNew
  const shown = (index: number) => !wizard || ready(index)
  // The first section not done yet is the one to fill now; the last one (estimates) once the others are done.
  const current = wizard ? [0, 1, 2].find((index) => !done(index)) ?? 3 : -1
  const complete = !wizard || ready(3)
  const sectionClass = (index: number) => `nf-step${wizard ? index === current ? ' nf-current' : index < 3 && done(index) ? ' nf-done' : '' : ''}`
  const heading = (index: number) => wizard ? <h3 className="nf-section-title"><span aria-hidden="true">{index < 3 && done(index) ? '✓' : index + 1}</span>{steps[index]}{index === current && <small> — fill this in next</small>}</h3> : null
  const goOn = ['', 'Check the DoD, then Continue.', 'Choose the User Stories, then Continue.', 'Enter the hours if you know them, then Save.']
  const missingNote = (index: number) => wizard && index === current ? <div className="nf-missing-row"><p className="nf-missing" role="note">{stepMissing[index].length ? `To go on, fill in ${stepMissing[index].join(', ')}.` : goOn[index]}</p>{(index === 1 || index === 2) && !stepMissing[index].length && <button type="button" className="primary nf-continue" disabled={creating} onClick={() => advance(index)}>Continue</button>}</div> : null
  function submit(event: React.FormEvent<HTMLFormElement>) {
    // Only Save creates the Feature (Enter in a field does not, see onKeyDown), and only when every section is filled.
    if (wizard && !complete) { event.preventDefault(); return }
    void create(event)
  }
  return <Modal title={resumeFeature ? 'Complete Feature children' : 'New Feature'} eyebrow="AZURE DEVOPS WRITE" onClose={closeEditor}><form onSubmit={submit} className="nf-form" noValidate={wizard && !complete} onKeyDown={(event) => { if (wizard && event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault() }}>
      <section className={sectionClass(0)} hidden={!shown(0)} aria-label={wizard ? 'Section 1: Feature' : undefined}>
        {heading(0)}
        {wizard && <p className="muted nf-hint">Start with the parent Epic: its setup decides the title fields, the DoD and the User Stories offered next.</p>}
        <div className="nf-head">
          <span className="nf-type">FEATURE</span>
          <div className="nf-headmain">
            {isNew && <div className="nf-top">
              <label>Parent Epic<select required aria-label="Parent Epic" disabled={creating} value={parent?.key ?? ''} onChange={(event) => setParent(epicOptions.find((item) => item.key === event.target.value) ?? null)}><option value="">Choose the parent Epic…</option>{epicOptions.map((epic) => <option value={epic.key} key={epic.key}>#{epic.id} · {epic.title}</option>)}</select></label>
            </div>}
            <input className="nf-title" aria-label="Feature title" name="title" required maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} disabled={creating || Boolean(resumeFeature)} placeholder={titleFields.length ? titleFields.map((field) => field.label).join(' | ') : 'Feature title (free text, e.g. Program | Service | Release)'} autoFocus />
            {fieldsElsewhere && <p className="muted">The {setupSource === 'personal' ? 'shared' : 'your own'} setup of this Epic has title fields ({otherSetup!.titleFields!.map((field) => field.label).join(', ')}); this form uses {setupSource === 'personal' ? 'your own' : 'the shared'} setup. <button type="button" className="text-button" disabled={creating} onClick={() => { setPreferShared(!preferShared); setSkipStories([]); setReviewChoice(null); setDodText(null) }}>{setupSource === 'personal' ? 'Use the shared setup' : 'Use my own setup'}</button></p>}
            {titleFields.length > 0 && <div className="nf-fields">{titleFields.map((field, index) => {
              const spec = epicEntry?.fields[index], list = spec?.type === 'list' ? listOf(epicFile, spec.list) : undefined
              // EPS-06: a Text field with an on-prem field offers the values found in the fetched on-prem data.
              const source = spec ? (spec.type === 'text' ? spec.source : undefined) : field.source || undefined
              const fromOnPrem = !list && source ? onPremValues(onPremSources, source) : []
              const options = list ? list.values : fromOnPrem
              const set = (value: string) => { setTypedFields((current) => ({ ...current, [fieldKey(field.label)]: value })); setTitleTyped(false) }
              const hint = spec ? spec.ifEmpty === 'block' ? 'Required' : spec.ifEmpty === 'warn' ? 'Warns if empty' : 'Optional' : field.source ? `On-prem: ${field.source}` : 'Optional'
              return <label key={field.label}>{field.label}{spec?.ifEmpty === 'block' && <span className="required-mark" aria-hidden="true"> *</span>}
                {options.length ? <select value={fieldValues[index]} disabled={creating} aria-required={spec?.ifEmpty === 'block'} title={source && !list ? `Values of ${source} in the fetched on-prem data` : undefined} onChange={(event) => set(event.target.value)}><option value="">{hint}…</option>{[...options, ...(fieldValues[index] && !options.includes(fieldValues[index]) ? [fieldValues[index]] : [])].map((value) => <option key={value} value={value}>{value}</option>)}</select>
                  : <input type={spec?.type === 'date' ? 'date' : spec?.type === 'number' ? 'number' : 'text'} value={fieldValues[index]} maxLength={255} disabled={creating} aria-required={spec?.ifEmpty === 'block'} onChange={(event) => set(event.target.value)} placeholder={source && !list ? `${hint} — no values of ${source} fetched yet` : hint} />}
              </label>
            })}</div>}
            {epicEntry && <p className="muted nf-epic-setup">Fields from the Epic setup of #{epicEntry.epicId}{fromFields?.lines.length ? `; into the Description: ${epicEntry.fields.filter((field) => field.into !== 'title').map((field) => field.label).join(', ')}` : ''}.</p>}
            {fromFields && fromFields.warned.length > 0 && <Notice tone="warning">Empty: {fromFields.warned.join(', ')} — the Feature is created, and the Epic setup asks for {fromFields.warned.length === 1 ? 'it' : 'them'}.</Notice>}
            {offListFields.length > 0 && <Notice tone="warning">Not in its list: {offListFields.join(', ')}.</Notice>}
          </div>
        </div>
        <div className="nf-strip">
          <label>Assigned to{canChoose ? <PersonPicker label="Assigned to" value={assigneeName} people={people.filter((person) => person.email !== me).map((person) => person.name)} onChange={setAssigneeName} meLabel={me ? `Me (${me})` : 'Choose a person…'} /> : <span className="nf-value" title={me}>{me || 'Set your work email in Settings'}</span>}</label>
          <label>State<span className="nf-value">{resumeFeature ? resumeFeature.state : 'New'}</span></label>
          <label>Area{parent ? <input name="areaPath" key={parent.key} value={parent.areaPath} readOnly title={parent.areaPath} /> : isNew ? <span className="nf-value muted">From the parent Epic</span> : <span className="nf-value" title={resumeFeature?.areaPath}>{resumeFeature?.areaPath.split('\\').pop()}</span>}</label>
          <label>Iteration (PI → Sprint)<select aria-label="PI / Sprint schedule" required value={sprintPath} onChange={(event) => { const pair = selectablePairs.find((value) => value.sprint.path === event.target.value); setSprintPath(pair?.sprint.path ?? ''); setIterationPath(pair?.pi.path ?? '') }} disabled={creating || iterationLoading}><option value="">{iterationLoading ? 'Loading the schedule…' : selectablePairs.length ? 'Select a PI → Sprint' : 'Load the schedule ↻'}</option>{pairs.length > 0 && <optgroup label="Current">{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pairLabel(pair)}</option>)}</optgroup>}{futurePairs.length > 0 && <optgroup label="Future">{futurePairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pairLabel(pair)}</option>)}</optgroup>}</select>
            <button type="button" className="text-button" onClick={() => void loadIterations()} disabled={creating || iterationLoading || !(pat || savedPat)} title="Reload the current and future PI / Sprint schedule">↻ Reload</button></label>
          {isNew && <label>Start date<input name="startDate" type="date" aria-label="Start date" value={startDate} disabled={creating} onChange={(event) => setStartDate(event.target.value)} title="Empty: today. Time Writing Tasks start in this month (not before the current month)." /></label>}
          {isNew && <label>Target date<input name="targetDate" type="date" aria-label="Target date" value={targetDate} min={startDate || undefined} disabled={creating} onChange={(event) => setTargetDate(event.target.value)} title="Time Writing Tasks are created for every month up to this one." /></label>}
        </div>
        {isNew && <p className={`muted nf-months${monthsError ? ' error-text' : ''}`} role={monthsError ? 'alert' : undefined}>{monthsError || <>Time Writing: {months.length === 1 ? <>one Task for <strong>{monthLabel}</strong></> : <>{months.length} month Tasks, <strong>{monthRange}</strong></>}{startDate ? '' : ' (Start date empty: from today)'}{targetDate ? '' : ' — set a Target date to add the months up to it'}.</>}</p>}
        {showPat ? <label>PAT — Work Items: Read &amp; Write<input type="password" required autoComplete="off" value={pat} onChange={(event) => { setPat(event.target.value); setIterationChoices([]); setIterationPath(''); setSprintPath('') }} disabled={creating} /><small>Saved in this browser only. Enter it, then ↻ Reload the schedule.</small></label>
          : <p className="muted nf-pat">Using your saved Azure DevOps token. <button type="button" className="text-button" disabled={creating} onClick={() => setShowPat(true)}>Use another token</button></p>}
        {missingNote(0)}
        {resumeFeature && <p className="muted">Adds the missing children of #{resumeFeature.id} without recreating the Feature. Tick the User Stories to add — none is ticked — or add one of your own. Existing children with the same title are reused.</p>}
      </section>
      {isNew && <section className={sectionClass(1)} hidden={!shown(1)} aria-label="Section 2: Definition of Done" tabIndex={-1}>
        {heading(1)}
        <p className="muted nf-hint">What has to be true for “{title.trim() || 'this Feature'}” to be done.</p>
        <label>Feature DoD (Definition of Done) — required<textarea required maxLength={100000} rows={6} value={dod} onChange={(event) => setDodText(event.target.value)} disabled={creating} placeholder="What has to be true for this Feature to be done" /><small>{dodText == null && epicSetup?.featureDoD.trim() ? `From the ${setupSource === 'personal' ? 'your own' : 'shared'} setup of Epic #${epicSetup.epicId}${classSet ? ` for ${classValue}` : ''}. ` : dodText == null ? 'This Epic has no Definition of Done set up: type it. ' : ''}Saved at the top of the Description.</small></label>
        <details className="nf-more"><summary>Description and acceptance criteria (optional)</summary>
          <label>Description<textarea name="description" maxLength={100000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={creating} /></label>
          <label>Acceptance criteria<textarea name="acceptance" maxLength={100000} disabled={creating} /></label>
        </details>
        {missingNote(1)}
      </section>}
      <section className={`nf-children ${sectionClass(2)}`} hidden={!shown(2)} aria-label={wizard ? 'Section 3: User Stories' : undefined} tabIndex={wizard ? -1 : undefined}>{heading(2)}{wizard ? <p className="muted nf-hint">Tick the User Stories to add under the Feature, and add one of your own if you need it. All are optional.</p> : null}<h4><strong>Child work items</strong> · {childCount} will be created or checked{baseSetup && epicSetup ? ` · ${setupSource === 'personal' ? 'your' : 'shared'} setup of Epic #${epicSetup.epicId}${classSet ? ` · ${classValue}` : ''}` : ''}</h4>
        {epicSetup && bothSetups && <p className="muted setup-source"><button type="button" className="text-button" disabled={creating} onClick={() => { setPreferShared(!preferShared); setSkipStories([]); setReviewChoice(null); setDodText(null) }}>{preferShared ? 'Use my own setup instead' : 'Use the shared setup instead'}</button></p>}
        {epicSetup ? <>
          <fieldset className="milestone-choices" disabled={creating}><legend>Optional User Stories</legend>
            {epicSetup.stories.length > 0 && <div className="button-row"><button type="button" className="text-button" onClick={() => { setSkipStories([]); storiesChosen(epicSetup.stories.length) }}>Select all</button><button type="button" className="text-button" onClick={() => { setSkipStories(epicSetup.stories.map((_, index) => index)); setReviewChoice(false) }}>Deselect all</button></div>}
            {epicSetup.stories.map((story, index) => <label className="checkbox-label" key={index}><input type="checkbox" checked={!skipStories.includes(index)} onChange={(event) => { setSkipStories((now) => event.target.checked ? now.filter((value) => value !== index) : [...now, index]); if (event.target.checked) setReviewChoice(false) }} />{filled(story.title)}</label>)}
            <label className="checkbox-label"><input type="checkbox" checked={reviewStory} onChange={(event) => chooseReview(event.target.checked)} />{reviewStoryTitle(title.trim() || '{feature}')} <small className="muted">(built-in, in the Sprint)</small></label>
          </fieldset>
          <p className="muted nf-always">Always: {title.trim() ? <>“{title.trim()} - Time Writing” at {config.project} (project root), with the Task “{monthLabel} | {title.trim()}”{months.length > 1 ? ` and one for each month up to ${months[months.length - 1]}` : ''}{epicSetup.task.originalEstimate != null ? ` (${epicSetup.task.originalEstimate}h by default)` : ''}.</> : 'the Time Writing User Story and the month Task (enter the title to see them).'}</p>
        </> : null}
        {<fieldset className="milestone-choices nf-own-story" disabled={creating}><legend>Your own User Story <small className="muted">(optional)</small></legend>
          <label>User Story title<input value={ownStory.title} maxLength={255} placeholder="Leave empty for none" onChange={(event) => setOwnStory((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>User Story description<textarea value={ownStory.description} rows={2} placeholder="What needs to be done, and why" onChange={(event) => setOwnStory((current) => ({ ...current, description: event.target.value }))} /></label>
          <label>Comment <small className="muted">(optional, added to its Discussion)</small><textarea value={ownStory.comment} rows={2} onChange={(event) => setOwnStory((current) => ({ ...current, comment: event.target.value }))} /></label>
          <small className="muted">Created under {resumeFeature ? 'the' : 'the new'} Feature in the Sprint chosen, assigned like the Feature.</small>
        </fieldset>}
        {missingNote(2)}
        <p className="info-line"><Info label="Paths and assignment">Feature → {resumeFeature ? resumeFeature.iterationPath : iterationPath || 'the PI chosen'}. Optional User Stories → {sprintPath || 'the Sprint chosen'}. Time Writing story and Task → {config.project}, never the Sprint, in the Feature’s Area Path (the same on every page; an existing month Task of the person is reused). Area: the Feature and its User Stories take the Epic’s Area Path. Every new item is assigned to {assignee || 'the person chosen'}. {month ? `Time Writing month: ${monthLabel}.` : 'The current month is the UTC month.'}</Info></p>
      </section>
      {isNew && <section className={sectionClass(3)} hidden={!shown(3)} aria-label={`Section 4: Estimates for ${monthRange}`} tabIndex={-1}>
        {heading(3)}
        {months.length === 1 ? <>
          <p className="muted nf-hint">The hours of the Time Writing Task “{monthLabel} | {title.trim() || '…'}”. Both are optional; you can change them later.</p>
          {lateTask && <p className="muted adhoc-note">Planning for {monthLabel} is locked: the new Task is tagged <code>ad-hoc</code>.</p>}
          <div className="nf-estimates">
            <label>Original Estimate (h)<input type="number" min="0" max="1000000" step="0.25" value={taskOriginalEstimate} onChange={(event) => setHours(monthLabel, { plan: event.target.value })} disabled={creating} placeholder={epicSetup?.task.originalEstimate != null ? `${epicSetup.task.originalEstimate} (setup)` : 'Optional'} /></label>
            <label>Completed Work (h)<input type="number" min="0" max="1000000" step="0.25" value={taskCompletedWork} onChange={(event) => setHours(monthLabel, { done: event.target.value })} disabled={creating || isFutureMonth(monthLabel, todayMonth)} placeholder={isFutureMonth(monthLabel, todayMonth) ? 'From that month' : 'Optional'} /></label>
          </div>
        </> : <>
          <p className="muted nf-hint">One Time Writing Task “{'{Month}'} | {title.trim() || '…'}” for each month. Enter the planned hours per month (optional; you can change them later). Completed Work cannot be entered for a future month.</p>
          <table className="nf-month-hours"><thead><tr><th scope="col">Month</th><th scope="col">Original Estimate (h)</th><th scope="col">Completed Work (h)</th></tr></thead>
            <tbody>{months.map((label) => { const future = isFutureMonth(label, todayMonth); return <tr key={label}><th scope="row">{label}{adhocAfterLock(label) && <small className="muted" title={`Planning for ${label} is locked: the new Task is tagged ad-hoc.`}> · ad-hoc</small>}</th>
              <td><input type="number" aria-label={`Original Estimate (h) ${label}`} min="0" max="1000000" step="0.25" value={hoursOf(label).plan} onChange={(event) => setHours(label, { plan: event.target.value })} disabled={creating} placeholder={epicSetup?.task.originalEstimate != null ? `${epicSetup.task.originalEstimate} (setup)` : 'Optional'} /></td>
              <td><input type="number" aria-label={`Completed Work (h) ${label}`} min="0" max="1000000" step="0.25" value={future ? '' : hoursOf(label).done} onChange={(event) => setHours(label, { done: event.target.value })} disabled={creating || future} placeholder={future ? '—' : 'Optional'} /></td></tr> })}</tbody>
            <tfoot><tr><th scope="row">Total</th><td>{months.reduce((sum, label) => sum + (Number(hoursOf(label).plan) || 0), 0)}</td><td>{months.reduce((sum, label) => sum + (isFutureMonth(label, todayMonth) ? 0 : Number(hoursOf(label).done) || 0), 0)}</td></tr></tfoot>
          </table>
        </>}
        <dl className="nf-summary" aria-label="Summary"><dt>Feature</dt><dd>{title.trim()}</dd><dt>Parent Epic</dt><dd>{parent ? `#${parent.id} · ${parent.title}` : ''}</dd><dt>PI → Sprint</dt><dd>{sprintPath.split('\\').slice(-2).join(' → ')}</dd><dt>Children</dt><dd>{childCount} will be created or checked{ownStory.title.trim() ? ', plus your own User Story' : ''}</dd><dt>Time Writing</dt><dd>{months.length === 1 ? monthLabel : `${months.length} months, ${monthRange}`}</dd></dl>
        {missingNote(3)}
      </section>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={closeEditor} disabled={creating}>Cancel</button>
        <button className="primary" title={needsDoD && !dod.trim() ? 'Enter the Feature DoD first' : undefined} disabled={creating || !complete || iterationLoading || (needsDoD && !dod.trim()) || !title.trim() || !sprintPath}>{creating ? 'Creating and verifying…' : resumeFeature ? 'Complete missing children' : 'Save'}</button></div>
    </form></Modal>
}
