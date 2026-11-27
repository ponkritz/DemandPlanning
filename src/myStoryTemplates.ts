import { cleanStoryTemplate, templatesFor, type EpicSetupFile, type StoryTemplateItem } from './epicSetup.ts'
import { fillTitle } from './featureSetup.ts'

// STT-04…STT-07: My User Story templates — each person's own templates, with the same fields as a shared one (title,
// description, Epic and Release Classification tags), kept in this browser's local storage (like the other "My …"
// settings: My bulk creation Epics, the work email), never in Git, a JSON backup, a snapshot or SharePoint. The file is
// keyed by the person's work email, so a second person on the same browser does not see them, and View as never shows
// them. Everything read back is checked: the schema, the sizes, the ids, and no text that looks like a token or PAT.
export const myStoryTemplatesKey = 'demand-planning-my-story-templates-v1'
export const maxMyStoryTemplates = 100
export const maxMyTemplatePeople = 20
export const maxMyDescription = 20000
// The whole file in local storage; a save that would make it larger is refused (the browser limit is about 5 MB for all of the app).
export const maxMyTemplatesBytes = 512 * 1024
export interface MyStoryTemplatesFile { schema: 1; kind: 'my-story-templates'; people: Record<string, StoryTemplateItem[]> }
export const emptyMyStoryTemplates = (): MyStoryTemplatesFile => ({ schema: 1, kind: 'my-story-templates', people: {} })

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const owner = (email: string) => email.trim().toLowerCase()
// Personal ids start with "m-", so they never meet a shared template's id ("t-…").
const myId = /^m-[a-z0-9-]{1,58}$/

// STT-06: text that looks like a secret is never kept: an Azure DevOps PAT (52 characters a–z, 2–7, or the 84-character
// form), a GitHub token, a "Bearer …" header or a private key. Returns what was found ('' = nothing).
const secretPatterns: [RegExp, string][] = [
  [/(^|[^A-Za-z0-9])[a-z2-7]{52}(?![A-Za-z0-9])/, 'an Azure DevOps PAT'],
  [/(^|[^A-Za-z0-9])[A-Za-z0-9]{76}AZDO[A-Za-z0-9]{4}(?![A-Za-z0-9])/, 'an Azure DevOps PAT'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/, 'a GitHub token'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i, 'a Bearer token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
]
export function secretIn(text: string): string {
  return secretPatterns.find(([pattern]) => pattern.test(text))?.[1] ?? ''
}

// One personal template, cleaned as a shared one (STT-01) with a shorter description; null when unusable or when it
// holds text that looks like a secret.
export function cleanMyStoryTemplate(input: unknown): StoryTemplateItem | null {
  const item = cleanStoryTemplate(input && typeof input === 'object' ? input as Record<string, unknown> : undefined)
  if (!item || !myId.test(item.id)) return null
  const clean = { ...item, description: item.description.slice(0, maxMyDescription) }
  return secretIn(`${clean.title}\n${clean.description}\n${clean.classes.join('\n')}`) ? null : clean
}

// Read strictly: anything that is not the file (bad JSON, another schema or kind) gives an empty file; per person (a
// valid email, at most 20) the usable templates, by id once, at most 100, sorted by title.
export function parseMyStoryTemplates(raw: string | null | undefined): MyStoryTemplatesFile {
  if (!raw || raw.length > maxMyTemplatesBytes * 2) return emptyMyStoryTemplates()
  let value: unknown
  try { value = JSON.parse(raw) } catch { return emptyMyStoryTemplates() }
  const file = value as Partial<Record<keyof MyStoryTemplatesFile, unknown>> | null
  if (!file || typeof file !== 'object' || file.schema !== 1 || file.kind !== 'my-story-templates' || !file.people || typeof file.people !== 'object' || Array.isArray(file.people)) return emptyMyStoryTemplates()
  const people: Record<string, StoryTemplateItem[]> = {}
  for (const [email, list] of Object.entries(file.people as Record<string, unknown>)) {
    const key = owner(email)
    if (!emailPattern.test(key) || key.length > 254 || people[key] || !Array.isArray(list)) continue
    const items = [...new Map(list.map(cleanMyStoryTemplate).filter((entry): entry is StoryTemplateItem => Boolean(entry)).map((entry) => [entry.id, entry])).values()]
      .slice(0, maxMyStoryTemplates).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    if (items.length) people[key] = items
    if (Object.keys(people).length === maxMyTemplatePeople) break
  }
  return { schema: 1, kind: 'my-story-templates', people }
}
export const serializeMyStoryTemplates = (file: MyStoryTemplatesFile) => JSON.stringify(parseMyStoryTemplates(JSON.stringify(file)))

// A person's own templates ('' email: none).
export const myTemplatesOf = (file: MyStoryTemplatesFile, email: string) => emailPattern.test(owner(email)) ? file.people[owner(email)] ?? [] : []

// STT-05 / STT-06: the file with one person's list replaced — the others' untouched. Refused (an Error saying why) without
// a work email, for a template without a title, with text that looks like a secret, over 100 templates or over the size.
export function withMyTemplates(file: MyStoryTemplatesFile, email: string, list: StoryTemplateItem[]): MyStoryTemplatesFile {
  const key = owner(email)
  if (!emailPattern.test(key)) throw new Error('Set your work email (My settings) to keep your own templates.')
  for (const item of list) {
    if (!item.title.trim()) throw new Error('Every template needs a title.')
    const found = secretIn(`${item.title}\n${item.description}\n${item.classes.join('\n')}`)
    if (found) throw new Error(`Not saved: “${item.title.trim().slice(0, 60)}” holds what looks like ${found}. Never put a PAT or a token in a template.`)
    if (item.description.length > maxMyDescription) throw new Error(`Not saved: a description of your own template may be up to ${maxMyDescription.toLocaleString('en-US')} characters.`)
  }
  if (list.length > maxMyStoryTemplates) throw new Error(`Not saved: you can keep up to ${maxMyStoryTemplates} templates of your own.`)
  const people = { ...file.people }
  if (list.length) people[key] = list; else delete people[key]
  if (!file.people[key] && list.length && Object.keys(file.people).length >= maxMyTemplatePeople) throw new Error(`Not saved: this browser already keeps templates for ${maxMyTemplatePeople} people.`)
  const next = parseMyStoryTemplates(JSON.stringify({ schema: 1, kind: 'my-story-templates', people }))
  if (myTemplatesOf(next, key).length !== list.length) throw new Error('Not saved: a template could not be kept (check its title and tags).')
  if (serializeMyStoryTemplates(next).length > maxMyTemplatesBytes) throw new Error('Not saved: your templates are too large for this browser. Shorten or remove some.')
  return next
}

export const newMyTemplateId = (list: StoryTemplateItem[], title: string) => {
  const base = `m-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'story'}`
  let id = base, n = 2
  while (list.some((entry) => entry.id === id)) id = `${base}-${n++}`
  return id
}

export function loadMyStoryTemplates(storage: Pick<Storage, 'getItem'> = localStorage): MyStoryTemplatesFile {
  try { return parseMyStoryTemplates(storage.getItem(myStoryTemplatesKey)) } catch { return emptyMyStoryTemplates() }
}
export function saveMyStoryTemplates(file: MyStoryTemplatesFile, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) {
  const clean = parseMyStoryTemplates(JSON.stringify(file))
  try {
    if (Object.keys(clean.people).length) storage.setItem(myStoryTemplatesKey, serializeMyStoryTemplates(clean)); else storage.removeItem(myStoryTemplatesKey)
  } catch { throw new Error('Not saved: this browser’s storage is full or blocked.') }
}

// STT-07: why a person cannot see or change their own templates here ('' = they can). View as never shows another
// person's (they are on that person's computer, if anywhere) nor the viewer's own; without a work email nobody owns them.
export function myTemplatesBlocked({ email, viewingAs }: { email: string; viewingAs: boolean }) {
  if (viewingAs) return 'Viewing as someone else: personal templates are not shown, and none can be changed. Exit View as to use your own.'
  if (!emailPattern.test(owner(email))) return 'Set your work email (My settings) to keep templates of your own.'
  return ''
}

// STT-07: what a picker offers to create a User Story — the shared templates unchanged (those fitting the Epic first,
// then the others), then the person's own after them, labelled "Mine". A personal template never takes a shared one's place.
export interface TemplateChoices { fitting: StoryTemplateItem[]; other: StoryTemplateItem[]; mine: StoryTemplateItem[] }
export function templateChoices(shared: EpicSetupFile | null | undefined, mine: StoryTemplateItem[], epicId?: number): TemplateChoices {
  const all = [...(shared?.storyTemplates ?? [])].sort((a, b) => a.title.localeCompare(b.title))
  const fit = epicId ? new Set(templatesFor(shared, epicId).map((item) => item.id)) : new Set<string>()
  return {
    fitting: all.filter((item) => fit.has(item.id)),
    other: all.filter((item) => !fit.has(item.id)),
    mine: [...mine].sort((a, b) => a.title.localeCompare(b.title)),
  }
}
export const choiceKey = (source: 'shared' | 'mine', id: string) => `${source}:${id}`
export function findChoice(choices: TemplateChoices, key: string): StoryTemplateItem | undefined {
  const [source, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  return source === 'mine' ? choices.mine.find((item) => item.id === id) : source === 'shared' ? [...choices.fitting, ...choices.other].find((item) => item.id === id) : undefined
}
// The title and description a picked template gives a new User Story: {feature} becomes the Feature's title; other
// placeholders stay for the person to fill.
export const fromTemplate = (item: StoryTemplateItem, featureTitle = '') => ({ title: fillTitle(item.title, featureTitle.trim() ? { feature: featureTitle.trim() } : {}).slice(0, 255), description: item.description })
