import type { AzureWorkItem } from './domain'
import { fieldOf } from './dpReleases.ts'
// Per-Epic setup for new Features: which optional User Stories are offered (all ticked by default), the Time Writing
// User Story (title, Description, Assigned to, Area and Iteration Path) and the defaults of the month Time Writing Task. Kept in the Git data repository as feature-setup.json, shared by everyone. Titles are
// plain text, optionally with placeholders filled in at creation: {feature} (the whole Feature title), {program},
// {service}, {version} (its parts, for titles like "Program | Service | v1.2"), {month} (e.g. "October 2026").
// An Epic without a setup keeps the built-in PU / Full Release milestones.
// Two layers: the shared setup (feature-setup.json, for everyone) and each person's own (feature-setup/<email>.json,
// same format). For its owner a personal setup of an Epic wins over the shared one; anyone who can write to Git may
// enable their setup of an Epic for everyone, which copies it into the shared file.
// templateId: linked to a User Story template of the Epic setup file (STT-02); title and description are its copy.
export interface StoryTemplate { title: string; description: string; templateId?: string }
export interface TaskTemplate { title: string; description: string; originalEstimate?: number; assignedTo: string; areaPath: string; iterationPath: string }
// The "Time Writing" User Story that holds the month Task: always created; its title and fields are configurable.
export interface TimeWritingStoryTemplate { title: string; description: string; assignedTo: string; areaPath: string; iterationPath: string }
// A part of the Feature title named per Epic (DP: Program, Service, Release; CP: Platform, Release Name, Number; …):
// the New Feature form asks for each, joins them into the title, writes "<label> : <value>" into the Description and
// offers {<label>} as a placeholder. source: the on-prem field that fills it from a release (Release Details).
export interface TitleField { label: string; source: string }
// featureDoD: the Feature DoD (Definition of Done) a new Feature under the Epic starts with — mandatory in a setup.
// titleFields: optional, at most maxTitleFields.
// DPF-01…03 (DP, Epic 13946): the Feature DoD and default User Stories per release type — Release (Major, Minor) and
// PU (MLD, Platform Update) — and which QE Mapping columns name the product and its QE. Used by Release Details → DP
// (QE, possible QEs, Create Features); built-in values when the setup has none.
export interface ReleaseTypeSetup { featureDoD: string; stories: StoryTemplate[] }
export interface QeMapColumns { matchColumn: string; qeColumn: string }
export interface EpicSetup { epicId: number; epicTitle: string; inherits?: InheritField[]; featureDoD: string; stories: StoryTemplate[]; timeWritingStory: TimeWritingStoryTemplate; task: TaskTemplate; titleFields?: TitleField[]; qeColumns?: QeMapColumns; classSets?: Record<string, ReleaseTypeSetup>; completeChildren?: false }
// CON-95: the shared file may hold defaults for all Epics; an Epic's setup (shared or mine) may leave fields to the
// layer above (inherits): Built in → All Epics → Epic (shared) → Mine.
export type InheritField = 'featureDoD' | 'stories' | 'estimate'
export const inheritFields: InheritField[] = ['featureDoD', 'stories', 'estimate']
export interface SetupDefaults { featureDoD?: string; stories?: StoryTemplate[]; originalEstimate?: number }
export interface FeatureSetupFile { schema: 1; kind: 'feature-setup'; epics: EpicSetup[]; defaults?: SetupDefaults }

export const featureSetupFile = 'feature-setup.json'
export const placeholders = ['feature', 'program', 'service', 'version', 'month'] as const
export const defaultTask: TaskTemplate = { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
// The built-in "Review of Deliverables" User Story: always created under a new Feature, in the Sprint chosen in the
// form (the current Sprint), whatever the Epic's setup; an existing one with the title is reused.
export const reviewStoryTitle = (featureTitle: string) => `Review of Deliverables - ${featureTitle.trim()}`
export const defaultTimeWritingStory: TimeWritingStoryTemplate = { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
// The default Feature DoD per release classification (also used by the built-in PU / Full Release creation).
export function featureDoD(kind: 'PU' | 'Release') {
  return kind === 'PU' ? 'DT finished. This is a PU release.' : 'IQOQ finished and Checklist uploaded into the Feature.'
}
export const emptySetup = (epicId: number, epicTitle = ''): EpicSetup => ({ epicId, epicTitle, featureDoD: '', stories: [], timeWritingStory: { ...defaultTimeWritingStory }, task: { ...defaultTask } })

export const maxTitleFields = 5
export const dpEpicId = 13946
// DPF-09: there are no built-in Release / PU (MLD) sets any more, and no built-in Release Classification values.
// DPF-07: a Definition of Done and User Stories per value of the Epic's own Release Classification list, chosen by the
// value picked when a Feature is created — New Feature and bulk alike; a value without its own set uses the Epic's own
// DoD and User Stories.
export const maxClassSets = 50
export const classSetKey = (setup: Pick<EpicSetup, 'classSets'> | undefined, value: string) => {
  const wanted = value.trim().toLowerCase()
  return wanted ? Object.keys(setup?.classSets ?? {}).find((key) => key.toLowerCase() === wanted) : undefined
}
/** The set of a Release Classification value; undefined = the Epic's default. */
export function setForClass(setup: EpicSetup | undefined, value: string): ReleaseTypeSetup | undefined {
  if (!setup || !value.trim()) return undefined
  const key = classSetKey(setup, value)
  if (!key) return undefined
  const own = setup.classSets![key]
  return { featureDoD: own.featureDoD.trim() || setup.featureDoD, stories: structuredClone(own.stories) }
}
/** Bulk creation: the value's set, else the Epic's own DoD and stories; nothing for an Epic without a setup. */
export function bulkSetFor(setup: EpicSetup | undefined, value: string): ReleaseTypeSetup | undefined {
  return setForClass(setup, value) ?? (setup ? { featureDoD: setup.featureDoD, stories: structuredClone(setup.stories) } : undefined)
}
// The placeholder key of a label: letters and digits in lower case ({Release Name} and {releasename} are the same).
export const fieldKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '')
// The values of the placeholders for a Feature title and month. With title fields, a title of exactly that many
// "|" parts also fills {<label>} of each (the form passes the typed values with fieldPlaceholders instead).
export function titleValues(featureTitle: string, month: string, fields: TitleField[] = []): Record<string, string> {
  const parts = featureTitle.split('|').map((part) => part.trim())
  const three = parts.length === 3 && parts.every(Boolean)
  const base: Record<string, string> = { feature: featureTitle.trim(), program: three ? parts[0] : '', service: three ? parts[1] : '', version: three ? parts[2].replace(/^v/i, '') : '', month }
  return fields.length ? { ...base, ...fieldPlaceholders(fields, parts.length === fields.length ? parts : []) } : base
}
export function fieldPlaceholders(fields: TitleField[], values: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field, index) => [fieldKey(field.label), (values[index] ?? '').trim()]).filter(([key]) => key))
}
// The Feature title from the typed parts: the filled ones joined with " | ".
export const fieldTitle = (values: string[]) => values.map((value) => value.trim()).filter(Boolean).join(' | ')
// The Description lines, one per field, also for a blank one ("Release Name :").
export const fieldLines = (fields: TitleField[], values: string[]) => fields.map((field, index) => `${field.label} : ${(values[index] ?? '').trim()}`.trimEnd())
// The values from on-prem work items (a release's items): per field, the first item with its source field filled.
export function fieldsFromItems(fields: TitleField[], items: Pick<AzureWorkItem, 'fields'>[]) {
  return fields.map((field) => field.source ? items.map((item) => fieldOf(item, field.source)?.trim()).find(Boolean) ?? '' : '')
}
// The typed parts from a title of exactly as many "|" parts (Release Details' title), else none.
export function fieldsFromTitle(fields: TitleField[], title: string) {
  const parts = title.split('|').map((part) => part.trim())
  return fields.map((_, index) => parts.length === fields.length ? parts[index] : '')
}
// Placeholders are replaced (any letter case, spaces ignored); other text in braces is kept as typed.
const braces = /\{([^{}\n]{1,60})\}/g
export function fillTitle(template: string, values: Record<string, string>) {
  return template.replace(braces, (whole, key: string) => Object.hasOwn(values, fieldKey(key)) ? values[fieldKey(key)] : whole).replace(/\s+/g, ' ').trim()
}
// Placeholders used by a template that have no value for this Feature (e.g. {service} on a title without "|" parts).
export function missingValues(template: string, values: Record<string, string>) {
  return [...template.matchAll(braces)].map((match) => fieldKey(match[1])).filter((key) => Object.hasOwn(values, key) && !values[key])
}

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
function cleanTask(input: Partial<Record<keyof TaskTemplate, unknown>> | undefined): TaskTemplate {
  const estimate = typeof input?.originalEstimate === 'number' && Number.isFinite(input.originalEstimate) && input.originalEstimate >= 0 && input.originalEstimate <= 1000000 ? input.originalEstimate : undefined
  const assignedTo = text(input?.assignedTo, 320).toLowerCase()
  return { title: text(input?.title, 255) || defaultTask.title, description: text(input?.description, 100000), ...(estimate != null ? { originalEstimate: estimate } : {}), assignedTo: isEmail(assignedTo) ? assignedTo : '', areaPath: text(input?.areaPath, 4096), iterationPath: text(input?.iterationPath, 4096) }
}
function cleanTimeWritingStory(input: Partial<Record<keyof TimeWritingStoryTemplate, unknown>> | undefined): TimeWritingStoryTemplate {
  const assignedTo = text(input?.assignedTo, 320).toLowerCase()
  return { title: text(input?.title, 255) || defaultTimeWritingStory.title, description: text(input?.description, 100000), assignedTo: isEmail(assignedTo) ? assignedTo : '', areaPath: text(input?.areaPath, 4096), iterationPath: text(input?.iterationPath, 4096) }
}
// At most maxTitleFields, labels unique (by placeholder key) and not {feature} or {month}.
export function cleanTitleFields(input: unknown): TitleField[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>(['feature', 'month'])
  return input.map((field: Partial<Record<keyof TitleField, unknown>>) => ({ label: text(field?.label, 60), source: text(field?.source, 255) }))
    .filter((field) => { const key = fieldKey(field.label); if (!key || seen.has(key)) return false; seen.add(key); return true }).slice(0, maxTitleFields)
}
const templateRef = (value: unknown) => typeof value === 'string' && /^[a-z0-9-]{1,60}$/.test(value) ? { templateId: value } : {}
const cleanStories = (input: unknown, max = 20) => Array.isArray(input) ? input.map((story: Partial<Record<keyof StoryTemplate, unknown>>) => ({ title: text(story?.title, 255), description: text(story?.description, 100000), ...templateRef(story?.templateId) })).filter((story) => story.title).slice(0, max) : []
function cleanClassSets(input: unknown): Record<string, ReleaseTypeSetup> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const sets: Record<string, ReleaseTypeSetup> = {}
  for (const [rawKey, rawSet] of Object.entries(input as Record<string, unknown>).slice(0, maxClassSets)) {
    const key = rawKey.trim().slice(0, 100)
    if (!key || Object.keys(sets).some((item) => item.toLowerCase() === key.toLowerCase()) || !rawSet || typeof rawSet !== 'object') continue
    const value = rawSet as Partial<Record<keyof ReleaseTypeSetup, unknown>>
    sets[key] = { featureDoD: text(value.featureDoD, 100000), stories: cleanStories(value.stories) }
  }
  return Object.keys(sets).length ? sets : undefined
}
function cleanQeColumns(input: unknown): QeMapColumns | undefined {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const matchColumn = text(value.matchColumn, 120), qeColumn = text(value.qeColumn, 120)
  return matchColumn && qeColumn ? { matchColumn, qeColumn } : undefined
}
export function cleanSetup(input: Partial<Record<keyof EpicSetup, unknown>>): EpicSetup | null {
  const epicId = Number(input.epicId)
  if (!Number.isSafeInteger(epicId) || epicId < 1) return null
  const stories = cleanStories(input.stories, 1000)
  // EPS-07: the Feature fields moved to the Epic setup; the old title fields are no longer read or saved.
  // DPF-09: the old Release / PU sets (releaseTypes) are no longer read; a save drops them.
  const qeColumns = cleanQeColumns(input.qeColumns), classSets = cleanClassSets(input.classSets)
  const inherits = Array.isArray(input.inherits) ? inheritFields.filter((field) => (input.inherits as unknown[]).includes(field)) : []
  return { epicId, epicTitle: text(input.epicTitle, 255), ...(inherits.length ? { inherits } : {}), featureDoD: text(input.featureDoD, 100000), stories, timeWritingStory: cleanTimeWritingStory(input.timeWritingStory as Partial<Record<keyof TimeWritingStoryTemplate, unknown>> | undefined), task: cleanTask(input.task as Partial<Record<keyof TaskTemplate, unknown>> | undefined), ...(qeColumns ? { qeColumns } : {}), ...(classSets ? { classSets } : {}), ...(input.completeChildren === false ? { completeChildren: false as const } : {}) }
}

export function parseFeatureSetup(raw: string): FeatureSetupFile {
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error(`${featureSetupFile} is not valid JSON.`) }
  const file = data as Partial<FeatureSetupFile> | null
  if (!file || file.schema !== 1 || file.kind !== 'feature-setup' || !Array.isArray(file.epics)) throw new Error(`${featureSetupFile} is not a Feature setup file.`)
  const epics = new Map<number, EpicSetup>()
  for (const entry of file.epics) { const setup = cleanSetup(entry as Partial<Record<keyof EpicSetup, unknown>>); if (setup) epics.set(setup.epicId, setup) }
  const defaults = cleanDefaults(file.defaults)
  return { schema: 1, kind: 'feature-setup', epics: [...epics.values()].sort((a, b) => a.epicId - b.epicId), ...(defaults ? { defaults } : {}) }
}
function cleanDefaults(input: unknown): SetupDefaults | undefined {
  if (!input || typeof input !== 'object') return undefined
  const value = input as Record<string, unknown>
  const featureDoD = text(value.featureDoD, 100000)
  const stories = Array.isArray(value.stories) ? cleanStories(value.stories, 1000) : undefined
  const estimate = typeof value.originalEstimate === 'number' && Number.isFinite(value.originalEstimate) && value.originalEstimate >= 0 && value.originalEstimate <= 1000000 ? value.originalEstimate : undefined
  const out: SetupDefaults = { ...(featureDoD ? { featureDoD } : {}), ...(stories ? { stories } : {}), ...(estimate != null ? { originalEstimate: estimate } : {}) }
  return Object.keys(out).length ? out : undefined
}
// Written clean: blank User Stories dropped, values trimmed, one entry per Epic in Epic order.
export const serializeFeatureSetup = (file: FeatureSetupFile) => { const defaults = cleanDefaults(file.defaults); return `${JSON.stringify({ schema: 1, kind: 'feature-setup', ...(defaults ? { defaults } : {}), epics: [...new Map(file.epics.map(cleanSetup).filter((entry): entry is EpicSetup => Boolean(entry)).map((entry) => [entry.epicId, entry])).values()].sort((a, b) => a.epicId - b.epicId) }, null, 2)}\n` }
export const setupFor = (file: FeatureSetupFile | null, epicId: number | undefined) => epicId == null ? undefined : file?.epics.find((entry) => entry.epicId === epicId)

// The personal setup file of a person, next to the shared one: feature-setup/<email>.json (lower case; characters
// outside letters, digits and . _ @ + - become _, and so do runs of dots). Empty for a missing or invalid email.
export function personalSetupPath(email: string) {
  const value = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `feature-setup/${value.replace(/[^a-z0-9._@+-]/g, '_').replace(/\.{2,}/g, '_')}.json` : ''
}
export interface FeatureSetups { shared: FeatureSetupFile | null; personal: FeatureSetupFile | null }
// BKL-28: the only Time Writing setting of an Epic setup — the default Original Estimate of a new month Task.
export function setupHours(setups: FeatureSetups | null | undefined, epicId: number | undefined): number | undefined { return chooseSetup(setups, epicId).setup?.task.originalEstimate }
export type SetupSource = 'personal' | 'shared' | 'defaults'
// The setup used for an Epic: my own first, else the shared one; preferShared skips mine when a shared one exists.
// CON-95: an Epic with a setup (mine or shared) gets each inheritable field from the nearest layer that sets it —
// Mine, then the Epic's shared setup, then All Epics, then Built in (the default DoD of its stories, no stories, no
// estimate); its other settings come from the setup used. An Epic with no setup of its own keeps the built-in
// milestones of the New Feature form (All Epics does not apply to it).
export type SetupOrigin = 'mine' | 'epic' | 'all' | 'builtin'
export function chooseSetup(setups: FeatureSetups | null | undefined, epicId: number | undefined, preferShared = false): { setup?: EpicSetup; source?: SetupSource; origin?: Record<InheritField, SetupOrigin> } {
  const personal = setupFor(setups?.personal ?? null, epicId), shared = setupFor(setups?.shared ?? null, epicId)
  const useMine = Boolean(personal && !(preferShared && shared))
  // CON-97: an Epic without a setup of its own uses All Epics when All Epics has anything set.
  const defaults = setups?.shared?.defaults
  const base = useMine ? personal : shared ?? (epicId != null && defaults && Object.keys(defaults).length ? { ...emptySetup(epicId), inherits: [...inheritFields] } : undefined)
  if (!base) return {}
  const layers = [...(useMine ? [{ entry: personal!, origin: 'mine' as const }] : []), ...(shared ? [{ entry: shared, origin: 'epic' as const }] : base && !useMine ? [{ entry: base, origin: 'epic' as const }] : [])]
  const resolved = resolveFields(layers, setups?.shared?.defaults)
  const setup: EpicSetup = { ...structuredClone(base), featureDoD: resolved.featureDoD, stories: resolved.stories, task: { ...base.task, ...(resolved.originalEstimate != null ? { originalEstimate: resolved.originalEstimate } : {}) } }
  if (resolved.originalEstimate == null) delete setup.task.originalEstimate
  // DPF-07: my own version without sets per Release Classification uses the shared ones.
  if (useMine && !setup.classSets && shared?.classSets) setup.classSets = structuredClone(shared.classSets)
  delete setup.inherits
  return { setup, source: useMine ? 'personal' : shared ? 'shared' : 'defaults', origin: resolved.origin }
}
// The value of each inheritable field and where it comes from, through the given layers (nearest first).
export function resolveFields(layers: { entry: EpicSetup; origin: SetupOrigin }[], defaults: SetupDefaults | undefined) {
  const set = (entry: EpicSetup, field: InheritField) => !(entry.inherits ?? []).includes(field)
  const pick = <T>(field: InheritField, own: (entry: EpicSetup) => T, fromDefaults: T | undefined): { value: T | undefined; origin: SetupOrigin } => {
    const layer = layers.find((item) => set(item.entry, field))
    if (layer) return { value: own(layer.entry), origin: layer.origin }
    return fromDefaults !== undefined ? { value: fromDefaults, origin: 'all' } : { value: undefined, origin: 'builtin' }
  }
  const stories = pick('stories', (entry) => structuredClone(entry.stories), defaults?.stories ? structuredClone(defaults.stories) : undefined)
  const dod = pick('featureDoD', (entry) => entry.featureDoD, defaults?.featureDoD)
  const estimate = pick('estimate', (entry) => entry.task.originalEstimate, defaults?.originalEstimate)
  const storyList = stories.value ?? []
  return {
    stories: storyList, featureDoD: dod.value ?? '', originalEstimate: estimate.value,
    origin: { stories: stories.origin, featureDoD: dod.origin, estimate: estimate.origin } as Record<InheritField, SetupOrigin>,
  }
}
// Every shared setup at a glance, by Epic number: what a Feature under the Epic gets, and whether my own setup of the
// Epic replaces it for me.
export interface SharedSetupRow { epicId: number; epicTitle: string; featureDoD: string; stories: string[]; timeWritingStory: string; storyAreaPath: string; storyIterationPath: string; task: string; originalEstimate?: number; mineInstead: boolean }
export function sharedSetupRows(setups: FeatureSetups | null | undefined): SharedSetupRow[] {
  return [...(setups?.shared?.epics ?? [])].sort((a, b) => a.epicId - b.epicId).map((entry) => ({
    epicId: entry.epicId, epicTitle: entry.epicTitle, featureDoD: entry.featureDoD ?? '', stories: entry.stories.map((story) => story.title),
    timeWritingStory: (entry.timeWritingStory ?? defaultTimeWritingStory).title, storyAreaPath: entry.timeWritingStory?.areaPath ?? '', storyIterationPath: entry.timeWritingStory?.iterationPath ?? '', task: entry.task.title,
    ...(entry.task.originalEstimate != null ? { originalEstimate: entry.task.originalEstimate } : {}),
    mineInstead: Boolean(setupFor(setups?.personal ?? null, entry.epicId)),
  }))
}
// Enable for everyone: the shared file with this Epic's entry replaced by (a copy of) the given one.
export function publishSetup(shared: FeatureSetupFile | null, entry: EpicSetup): FeatureSetupFile {
  const epics = (shared?.epics ?? []).filter((item) => item.epicId !== entry.epicId)
  return { schema: 1, kind: 'feature-setup', epics: [...epics, structuredClone(entry)].sort((a, b) => a.epicId - b.epicId), ...(shared?.defaults ? { defaults: shared.defaults } : {}) }
}

// The built-in milestone stories (used when an Epic has no setup) as an editable setup: PU = SFV, DT, IQOQ; Full
// Release = PRD, SFV, DT, IQOQ, titled "{milestone} : Review of Deliverables ({service} {version})" — the same titles
// the built-in creation gives — with the default Time Writing story and Task.
export const builtinMilestones = { PU: ['SFV', 'DT', 'IQOQ'], Release: ['PRD', 'SFV', 'DT', 'IQOQ'] } as const
export function builtinSetup(epicId: number, epicTitle: string, kind: keyof typeof builtinMilestones): EpicSetup {
  return { ...emptySetup(epicId, epicTitle), featureDoD: featureDoD(kind), stories: builtinMilestones[kind].map((milestone) => ({ title: `${milestone} : Review of Deliverables ({service} {version})`, description: '' })) }
}
// Copy one Epic's setup to another Epic in the same file (replacing what the target had).
export function copySetup(file: FeatureSetupFile, fromEpicId: number, toEpicId: number, toEpicTitle = ''): FeatureSetupFile {
  const source = setupFor(file, fromEpicId)
  if (!source || fromEpicId === toEpicId) return file
  const copy = { ...structuredClone(source), epicId: toEpicId, epicTitle: toEpicTitle }
  return { ...file, epics: [...file.epics.filter((entry) => entry.epicId !== toEpicId), copy].sort((a, b) => a.epicId - b.epicId) }
}
// Editing the shared setups in their list: a copy of the file with one Epic's entry changed (nothing happens for an
// Epic without a setup), or without it.
export function editSetup(file: FeatureSetupFile, epicId: number, update: (entry: EpicSetup) => void): FeatureSetupFile {
  if (!setupFor(file, epicId)) return file
  const next = structuredClone(file)
  const entry = next.epics.find((item) => item.epicId === epicId)!
  entry.timeWritingStory ??= { ...defaultTimeWritingStory }
  update(entry)
  return next
}
export const removeSetup = (file: FeatureSetupFile, epicId: number): FeatureSetupFile => ({ ...file, epics: file.epics.filter((entry) => entry.epicId !== epicId) })
// A setup is saved only with its Feature DoD: the Epics of a draft that are new or changed against the saved file and
// have none (unchanged older entries without one do not block saving).
export function setupsMissingDoD(draft: FeatureSetupFile, saved: FeatureSetupFile | null): number[] {
  return draft.epics.filter((entry) => !(entry.inherits ?? []).includes('featureDoD') && !(entry.featureDoD ?? '').trim() && JSON.stringify(entry) !== JSON.stringify(setupFor(saved, entry.epicId) ?? null)).map((entry) => entry.epicId).sort((a, b) => a - b)
}
// The default Feature DoD for a setup that has none: Full Release when it has a PRD story (only Full Releases do),
// else PU. Only a pre-fill — it is reviewed and saved by the user.
export const defaultDoDFor = (entry: Pick<EpicSetup, 'stories'>) => featureDoD(entry.stories.some((story) => /\bPRD\b/i.test(story.title)) ? 'Release' : 'PU')
export const missingDoD = (entry: Pick<EpicSetup, 'featureDoD' | 'inherits'>) => !(entry.inherits ?? []).includes('featureDoD') && !(entry.featureDoD ?? '').trim()
export function fillMissingDoD(file: FeatureSetupFile): { file: FeatureSetupFile; filled: number[] } {
  const filled = file.epics.filter(missingDoD).map((entry) => entry.epicId)
  if (!filled.length) return { file, filled }
  return { file: { ...file, epics: file.epics.map((entry) => missingDoD(entry) ? { ...structuredClone(entry), featureDoD: defaultDoDFor(entry) } : entry) }, filled }
}

// STT-02: stories linked to a User Story template take its current title and description; a removed template leaves
// the copy saved with the story.
export function linkStories(stories: StoryTemplate[], templates: { id: string; title: string; description: string }[]): StoryTemplate[] {
  return stories.map((story) => { const found = story.templateId ? templates.find((item) => item.id === story.templateId) : undefined; return found ? { ...story, title: found.title, description: found.description } : story })
}
export function withLinkedStories(setup: EpicSetup | undefined, templates: { id: string; title: string; description: string }[] | undefined): EpicSetup | undefined {
  if (!setup || !templates?.length) return setup
  const next = structuredClone(setup)
  next.stories = linkStories(next.stories, templates)
  if (next.classSets) for (const key of Object.keys(next.classSets)) next.classSets[key].stories = linkStories(next.classSets[key].stories, templates)
  return next
}

// How many stories of a Feature setup file link to the template (every Epic, its value sets, old Release / PU sets, All Epics).
export function templateUses(file: FeatureSetupFile | null | undefined, id: string) {
  if (!file) return 0
  const lists = [file.defaults?.stories ?? [], ...file.epics.flatMap((entry) => [entry.stories, ...Object.values(entry.classSets ?? {}).map((set) => set.stories)])]
  return lists.reduce((sum, stories) => sum + stories.filter((story) => story.templateId === id).length, 0)
}


// BKL-38: "Complete children" is offered per Epic — a team decision in the shared setup (Admin → Epic & Feature setup),
// on unless the Epic's shared setup turns it off; an Epic without a setup keeps it on.
export const completeChildrenOn = (setups: FeatureSetups | null | undefined, epicId: number | undefined) => epicId == null || setupFor(setups?.shared ?? null, epicId)?.completeChildren !== false
