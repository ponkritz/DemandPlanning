// Per-Epic setup for new Features: which optional User Stories are offered (all ticked by default), the Time Writing
// User Story (title, Description, Assigned to, Area and Iteration Path) and the defaults of the month Time Writing Task. Kept in the Git data repository as feature-setup.json, shared by everyone. Titles are
// plain text, optionally with placeholders filled in at creation: {feature} (the whole Feature title), {program},
// {service}, {version} (its parts, for titles like "Program | Service | v1.2"), {month} (e.g. "October 2026").
// An Epic without a setup keeps the built-in PU / Full Release milestones.
// Two layers: the shared setup (feature-setup.json, for everyone) and each person's own (feature-setup/<email>.json,
// same format). For its owner a personal setup of an Epic wins over the shared one; anyone who can write to Git may
// enable their setup of an Epic for everyone, which copies it into the shared file.
export interface StoryTemplate { title: string; description: string }
export interface TaskTemplate { title: string; description: string; originalEstimate?: number; assignedTo: string; areaPath: string; iterationPath: string }
// The "Time Writing" User Story that holds the month Task: always created; its title and fields are configurable.
export interface TimeWritingStoryTemplate { title: string; description: string; assignedTo: string; areaPath: string; iterationPath: string }
// featureDoD: the Feature DoD (Definition of Done) a new Feature under the Epic starts with — mandatory in a setup.
export interface EpicSetup { epicId: number; epicTitle: string; featureDoD: string; stories: StoryTemplate[]; timeWritingStory: TimeWritingStoryTemplate; task: TaskTemplate }
export interface FeatureSetupFile { schema: 1; kind: 'feature-setup'; epics: EpicSetup[] }

export const featureSetupFile = 'feature-setup.json'
export const placeholders = ['feature', 'program', 'service', 'version', 'month'] as const
export const defaultTask: TaskTemplate = { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
export const defaultTimeWritingStory: TimeWritingStoryTemplate = { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
// The default Feature DoD per release classification (also used by the built-in PU / Full Release creation).
export function featureDoD(kind: 'PU' | 'Release') {
  return kind === 'PU' ? 'DT finished. This is a PU release.' : 'IQOQ finished and Checklist uploaded into the Feature.'
}
export const emptySetup = (epicId: number, epicTitle = ''): EpicSetup => ({ epicId, epicTitle, featureDoD: '', stories: [], timeWritingStory: { ...defaultTimeWritingStory }, task: { ...defaultTask } })

// The values of the placeholders for a Feature title and month.
export function titleValues(featureTitle: string, month: string): Record<(typeof placeholders)[number], string> {
  const parts = featureTitle.split('|').map((part) => part.trim())
  const three = parts.length === 3 && parts.every(Boolean)
  return { feature: featureTitle.trim(), program: three ? parts[0] : '', service: three ? parts[1] : '', version: three ? parts[2].replace(/^v/i, '') : '', month }
}
// Placeholders are replaced (any letter case); other text in braces is kept as typed.
export function fillTitle(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => Object.hasOwn(values, key.toLowerCase()) ? values[key.toLowerCase()] : whole).replace(/\s+/g, ' ').trim()
}
// Placeholders used by a template that have no value for this Feature (e.g. {service} on a title without "|" parts).
export function missingValues(template: string, values: Record<string, string>) {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1].toLowerCase()).filter((key) => Object.hasOwn(values, key) && !values[key])
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
export function cleanSetup(input: Partial<Record<keyof EpicSetup, unknown>>): EpicSetup | null {
  const epicId = Number(input.epicId)
  if (!Number.isSafeInteger(epicId) || epicId < 1) return null
  const stories = Array.isArray(input.stories) ? input.stories.map((story: Partial<Record<keyof StoryTemplate, unknown>>) => ({ title: text(story?.title, 255), description: text(story?.description, 100000) })).filter((story) => story.title) : []
  return { epicId, epicTitle: text(input.epicTitle, 255), featureDoD: text(input.featureDoD, 100000), stories, timeWritingStory: cleanTimeWritingStory(input.timeWritingStory as Partial<Record<keyof TimeWritingStoryTemplate, unknown>> | undefined), task: cleanTask(input.task as Partial<Record<keyof TaskTemplate, unknown>> | undefined) }
}

export function parseFeatureSetup(raw: string): FeatureSetupFile {
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error(`${featureSetupFile} is not valid JSON.`) }
  const file = data as Partial<FeatureSetupFile> | null
  if (!file || file.schema !== 1 || file.kind !== 'feature-setup' || !Array.isArray(file.epics)) throw new Error(`${featureSetupFile} is not a Feature setup file.`)
  const epics = new Map<number, EpicSetup>()
  for (const entry of file.epics) { const setup = cleanSetup(entry as Partial<Record<keyof EpicSetup, unknown>>); if (setup) epics.set(setup.epicId, setup) }
  return { schema: 1, kind: 'feature-setup', epics: [...epics.values()].sort((a, b) => a.epicId - b.epicId) }
}
// Written clean: blank User Stories dropped, values trimmed, one entry per Epic in Epic order.
export const serializeFeatureSetup = (file: FeatureSetupFile) => `${JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [...new Map(file.epics.map(cleanSetup).filter((entry): entry is EpicSetup => Boolean(entry)).map((entry) => [entry.epicId, entry])).values()].sort((a, b) => a.epicId - b.epicId) }, null, 2)}\n`
export const setupFor = (file: FeatureSetupFile | null, epicId: number | undefined) => epicId == null ? undefined : file?.epics.find((entry) => entry.epicId === epicId)

// The personal setup file of a person, next to the shared one: feature-setup/<email>.json (lower case; characters
// outside letters, digits and . _ @ + - become _, and so do runs of dots). Empty for a missing or invalid email.
export function personalSetupPath(email: string) {
  const value = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `feature-setup/${value.replace(/[^a-z0-9._@+-]/g, '_').replace(/\.{2,}/g, '_')}.json` : ''
}
export interface FeatureSetups { shared: FeatureSetupFile | null; personal: FeatureSetupFile | null }
export type SetupSource = 'personal' | 'shared'
// The setup used for an Epic: my own first, else the shared one; preferShared skips mine when a shared one exists.
export function chooseSetup(setups: FeatureSetups | null | undefined, epicId: number | undefined, preferShared = false): { setup?: EpicSetup; source?: SetupSource } {
  const personal = setupFor(setups?.personal ?? null, epicId), shared = setupFor(setups?.shared ?? null, epicId)
  if (personal && !(preferShared && shared)) return { setup: personal, source: 'personal' }
  return shared ? { setup: shared, source: 'shared' } : {}
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
  return { schema: 1, kind: 'feature-setup', epics: [...epics, structuredClone(entry)].sort((a, b) => a.epicId - b.epicId) }
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
  return draft.epics.filter((entry) => !(entry.featureDoD ?? '').trim() && JSON.stringify(entry) !== JSON.stringify(setupFor(saved, entry.epicId) ?? null)).map((entry) => entry.epicId).sort((a, b) => a - b)
}
