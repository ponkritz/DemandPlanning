// Per-Epic setup for new Features: which optional User Stories are offered (all ticked by default), the Time Writing
// User Story (title, Description, Assigned to, Area and Iteration Path) and the defaults of the month Time Writing Task. Kept in the Git data repository as feature-setup.json, shared by everyone. Titles are
// plain text, optionally with placeholders filled in at creation: {feature} (the whole Feature title), {program},
// {service}, {version} (its parts, for titles like "Program | Service | v1.2"), {month} (e.g. "October 2026").
// An Epic without a setup keeps the built-in PU / Full Release milestones.
export interface StoryTemplate { title: string; description: string }
export interface TaskTemplate { title: string; description: string; originalEstimate?: number; assignedTo: string; areaPath: string; iterationPath: string }
// The "Time Writing" User Story that holds the month Task: always created; its title and fields are configurable.
export interface TimeWritingStoryTemplate { title: string; description: string; assignedTo: string; areaPath: string; iterationPath: string }
export interface EpicSetup { epicId: number; epicTitle: string; stories: StoryTemplate[]; timeWritingStory: TimeWritingStoryTemplate; task: TaskTemplate }
export interface FeatureSetupFile { schema: 1; kind: 'feature-setup'; epics: EpicSetup[] }

export const featureSetupFile = 'feature-setup.json'
export const placeholders = ['feature', 'program', 'service', 'version', 'month'] as const
export const defaultTask: TaskTemplate = { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
export const defaultTimeWritingStory: TimeWritingStoryTemplate = { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
export const emptySetup = (epicId: number, epicTitle = ''): EpicSetup => ({ epicId, epicTitle, stories: [], timeWritingStory: { ...defaultTimeWritingStory }, task: { ...defaultTask } })

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
  return { epicId, epicTitle: text(input.epicTitle, 255), stories, timeWritingStory: cleanTimeWritingStory(input.timeWritingStory as Partial<Record<keyof TimeWritingStoryTemplate, unknown>> | undefined), task: cleanTask(input.task as Partial<Record<keyof TaskTemplate, unknown>> | undefined) }
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
