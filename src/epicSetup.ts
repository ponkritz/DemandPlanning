import type { AzureWorkItem } from './domain'
import { fieldKey, fieldsFromItems, fillTitle, type TitleField } from './featureSetup.ts'

// Epic setup (EPS-01…): per Epic, the extra fields a new Feature under it carries — Program for DP, Platform for CP, … —
// shared for everyone in Git (epic-setup.json). It replaces Master data: the drop-downs come from a shared library of
// value lists. A field goes into the Feature's Description ("Label : value"), its Title, or both; the Title can follow
// a pattern of the fields' placeholders. An empty field is Optional, Warn (created, and listed) or Block (not created).
// The fields apply to every new Feature under the Epic — New Feature and bulk creation — with or without a Feature setup.

export type FieldType = 'text' | 'list' | 'number' | 'date'
export type IfEmpty = 'optional' | 'warn' | 'block'
export type FieldInto = 'description' | 'title' | 'both'
export interface EpicField { label: string; type: FieldType; list?: string; ifEmpty: IfEmpty; into: FieldInto; source?: string; classRules?: ClassRule[] }
// DPF-10: on an Epic's "Release Classification" List field, per value the parts of the release number that, when they
// are the deepest non-zero part, give that value — x.0 (5.0, 5.0.0, 5.0.0.0), x.y (5.2), x.y.z (5.2.1), x.y.z.w
// (5.2.1.3). A part decides at most one value.
export type ReleasePart = 'x.0' | 'x.y' | 'x.y.z' | 'x.y.z.w'
export interface ClassRule { value: string; parts: ReleasePart[] }
export const releaseParts: { key: ReleasePart; label: string; detail: string }[] = [
  { key: 'x.0', label: 'x.0 — first number only', detail: 'x.0, x.0.0, x.0.0.0' },
  { key: 'x.y', label: 'x.y — second number', detail: 'x.y, x.y.0, x.y.0.0' },
  { key: 'x.y.z', label: 'x.y.z — third number', detail: 'x.y.z, x.y.z.0' },
  { key: 'x.y.z.w', label: 'x.y.z.w — fourth number', detail: 'x.y.z.w' },
]
export const maxClassRules = 50
// EPS-11: productOwner — the Epic's Product Owner (a person, not the app role), by work email (lower case) with the
// display name shown; one per Epic, none when not set (a file saved before it loads unchanged).
export interface ProductOwner { email: string; name: string }
export interface EpicFields { epicId: number; epicTitle: string; fields: EpicField[]; titlePattern?: string; productOwner?: ProductOwner }
export interface ValueList { id: string; name: string; values: string[] }
// STT-01: a User Story template — its title (placeholders allowed) and description — tagged with the Epics and Release
// Classification values it is offered for (none = any). Stories of the Feature setup link to it by id (STT-02).
export interface StoryTemplateItem { id: string; title: string; description: string; epics: number[]; classes: string[] }
export interface EpicSetupFile { schema: 1; kind: 'epic-setup'; lists: ValueList[]; epics: EpicFields[]; storyTemplates?: StoryTemplateItem[] }

export const epicSetupFile = 'epic-setup.json'
export const maxEpicFields = 12
export const fieldTypes: { key: FieldType; label: string }[] = [{ key: 'text', label: 'Text' }, { key: 'list', label: 'List' }, { key: 'number', label: 'Number' }, { key: 'date', label: 'Date' }]
export const ifEmptyOptions: { key: IfEmpty; label: string }[] = [{ key: 'optional', label: 'Optional' }, { key: 'warn', label: 'Warn' }, { key: 'block', label: 'Block' }]
export const intoOptions: { key: FieldInto; label: string }[] = [{ key: 'description', label: 'Description' }, { key: 'title', label: 'Title' }, { key: 'both', label: 'Title and Description' }]
export const emptyEpicSetup = (): EpicSetupFile => ({ schema: 1, kind: 'epic-setup', lists: [], epics: [] })

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback
const listId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export const maxStoryTemplates = 200
export function cleanStoryTemplate(input: Partial<Record<keyof StoryTemplateItem, unknown>> | undefined): StoryTemplateItem | null {
  const title = text(input?.title, 255), id = text(input?.id, 60)
  if (!title || !/^[a-z0-9-]{1,60}$/.test(id)) return null
  const epics = Array.isArray(input?.epics) ? [...new Set(input.epics.map(Number).filter((epic) => Number.isSafeInteger(epic) && epic > 0))].slice(0, 200) : []
  const classes: string[] = []
  for (const value of Array.isArray(input?.classes) ? input.classes : []) { const item = text(value, 100); if (item && !classes.some((known) => known.toLowerCase() === item.toLowerCase())) classes.push(item) }
  return { id, title, description: text(input?.description, 100000), epics, classes: classes.slice(0, 50) }
}
export function cleanList(input: Partial<Record<keyof ValueList, unknown>> | undefined): ValueList | null {
  const name = text(input?.name, 60)
  const id = text(input?.id, 60) || listId(name)
  if (!name || !/^[a-z0-9-]{1,60}$/.test(id)) return null
  const values = Array.isArray(input?.values) ? [...new Set(input.values.map((value) => text(value, 255)).filter(Boolean))].slice(0, 500) : []
  return { id, name, values }
}
// DPF-10: the rules read strictly — an array of { value, parts }; a value of text (255), not twice (any case); parts only
// the four known ones, each once and given to one value only (the first keeps it); a rule left without parts is dropped;
// at most 50. Nothing usable gives no rules (as a file saved before them).
const classificationKey = 'releaseclassification'
export function cleanClassRules(input: unknown): ClassRule[] | undefined {
  if (!Array.isArray(input)) return undefined
  const rules: ClassRule[] = [], taken = new Set<ReleasePart>()
  for (const entry of input as Partial<Record<keyof ClassRule, unknown>>[]) {
    const value = text(entry?.value, 255)
    if (!value || rules.some((rule) => rule.value.toLowerCase() === value.toLowerCase()) || !Array.isArray(entry?.parts)) continue
    const parts = releaseParts.map((part) => part.key).filter((key) => (entry.parts as unknown[]).includes(key) && !taken.has(key))
    if (!parts.length) continue
    for (const part of parts) taken.add(part)
    rules.push({ value, parts })
    if (rules.length === maxClassRules) break
  }
  return rules.length ? rules : undefined
}
// Labels unique by placeholder key (and not {feature} or {month}); a list field without a known list becomes text.
export function cleanFields(input: unknown, lists: ValueList[]): EpicField[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>(['feature', 'month'])
  return input.map((field: Partial<Record<keyof EpicField, unknown>>) => {
    const type = oneOf(field?.type, ['text', 'list', 'number', 'date'] as const, 'text')
    const list = text(field?.list, 60)
    const known = type === 'list' && lists.some((entry) => entry.id === list)
    const source = text(field?.source, 255), label = text(field?.label, 60)
    // DPF-10: rules only on a known List field named Release Classification.
    const classRules = known && fieldKey(label) === classificationKey ? cleanClassRules(field?.classRules) : undefined
    return { label, type: type === 'list' && !known ? 'text' as const : type, ...(known ? { list } : {}), ifEmpty: oneOf(field?.ifEmpty, ['optional', 'warn', 'block'] as const, 'optional'), into: oneOf(field?.into, ['description', 'title', 'both'] as const, 'description'), ...(source ? { source } : {}), ...(classRules ? { classRules } : {}) }
  }).filter((field) => { const key = fieldKey(field.label); if (!key || seen.has(key)) return false; seen.add(key); return true }).slice(0, maxEpicFields)
}
// EPS-11: a Product Owner reads strictly — a work email (one @, no spaces, at most 254, kept in lower case) and a display
// name (text, 255; the email's name part when none is given); anything else is no Product Owner.
export function cleanProductOwner(input: unknown): ProductOwner | undefined {
  const value = input as Partial<Record<keyof ProductOwner, unknown>> | null | undefined
  const email = text(value?.email, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined
  const name = text(value?.name, 255).replace(/\s+/g, ' ')
  return { email, name: name || email.slice(0, email.indexOf('@')) }
}
export function cleanEpicFields(input: Partial<Record<keyof EpicFields, unknown>> | undefined, lists: ValueList[]): EpicFields | null {
  const epicId = Number(input?.epicId)
  if (!Number.isSafeInteger(epicId) || epicId < 1) return null
  const titlePattern = text(input?.titlePattern, 255)
  const productOwner = cleanProductOwner(input?.productOwner)
  return { epicId, epicTitle: text(input?.epicTitle, 255), fields: cleanFields(input?.fields, lists), ...(titlePattern ? { titlePattern } : {}), ...(productOwner ? { productOwner } : {}) }
}
export function parseEpicSetup(raw: string): EpicSetupFile {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error(`${epicSetupFile} is not valid JSON.`) }
  const file = value as Partial<Record<keyof EpicSetupFile, unknown>> | null
  if (!file || file.schema !== 1 || file.kind !== 'epic-setup') throw new Error(`${epicSetupFile} is not an Epic setup file.`)
  const lists = [...new Map((Array.isArray(file.lists) ? file.lists : []).map(cleanList).filter((entry): entry is ValueList => Boolean(entry)).map((entry) => [entry.id, entry])).values()]
  const epics = [...new Map((Array.isArray(file.epics) ? file.epics : []).map((entry) => cleanEpicFields(entry, lists)).filter((entry): entry is EpicFields => Boolean(entry)).map((entry) => [entry.epicId, entry])).values()]
  const storyTemplates = [...new Map((Array.isArray(file.storyTemplates) ? file.storyTemplates : []).map(cleanStoryTemplate).filter((entry): entry is StoryTemplateItem => Boolean(entry)).map((entry) => [entry.id, entry])).values()].slice(0, maxStoryTemplates)
  return { schema: 1, kind: 'epic-setup', lists, epics, ...(storyTemplates.length ? { storyTemplates } : {}) }
}
export const serializeEpicSetup = (file: EpicSetupFile) => {
  const clean = parseEpicSetup(JSON.stringify(file))
  return `${JSON.stringify({ ...clean, lists: [...clean.lists].sort((a, b) => a.name.localeCompare(b.name)), epics: [...clean.epics].sort((a, b) => a.epicId - b.epicId), ...(clean.storyTemplates ? { storyTemplates: [...clean.storyTemplates].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)) } : {}) }, null, 2)}\n`
}
export const epicFieldsFor = (file: EpicSetupFile | null | undefined, epicId: number | undefined) => epicId == null ? undefined : file?.epics.find((entry) => entry.epicId === epicId && entry.fields.length > 0)
export const listOf = (file: EpicSetupFile | null | undefined, id: string | undefined) => id ? file?.lists.find((entry) => entry.id === id) : undefined
export const asTitleFields = (fields: EpicField[]): TitleField[] => fields.map((field) => ({ label: field.label, source: field.source ?? '' }))

// The Feature from the values typed (in field order): its Title — the pattern filled, else the Title fields joined
// with " | ", else the title given — its Description lines, and the empty fields that block or warn.
export interface FeatureFromFields { title: string; lines: string[]; blocked: string[]; warned: string[] }
export function featureFromFields(entry: EpicFields, values: string[], fallbackTitle = ''): FeatureFromFields {
  const value = (index: number) => (values[index] ?? '').trim()
  const placeholders: Record<string, string> = { feature: fallbackTitle.trim(), ...Object.fromEntries(entry.fields.map((field, index) => [fieldKey(field.label), value(index)])) }
  const titled = entry.fields.map((field, index) => field.into === 'description' ? '' : value(index)).filter(Boolean)
  const title = entry.titlePattern ? fillTitle(entry.titlePattern, placeholders).replace(/(\s*\|\s*)+$/, '').replace(/^(\s*\|\s*)+/, '').replace(/(\s*\|\s*){2,}/g, ' | ') : titled.length ? titled.join(' | ') : fallbackTitle.trim()
  const lines = entry.fields.flatMap((field, index) => field.into === 'title' ? [] : [`${field.label} : ${value(index)}`.trimEnd()])
  const empty = (kind: IfEmpty) => entry.fields.filter((field, index) => field.ifEmpty === kind && !value(index)).map((field) => field.label)
  return { title, lines, blocked: empty('block'), warned: empty('warn') }
}
// A list value not in its list (e.g. typed before the list changed) is flagged, not dropped.
export function offList(entry: EpicFields, values: string[], file: EpicSetupFile | null | undefined) {
  return entry.fields.flatMap((field, index) => { const list = field.type === 'list' ? listOf(file, field.list) : undefined; const value = (values[index] ?? '').trim(); return list && value && !list.values.includes(value) ? [field.label] : [] })
}

// Copy to Epics: one Epic's fields and title pattern to others (e.g. the six ECP Epics), replacing theirs. EPS-11: each
// target keeps its own Product Owner (the source's is not copied).
export function copyEpicFields(file: EpicSetupFile, fromEpicId: number, to: { id: number; title: string }[]): EpicSetupFile {
  const source = file.epics.find((entry) => entry.epicId === fromEpicId)
  if (!source) return file
  const targets = to.filter((epic) => epic.id !== fromEpicId)
  const copied = structuredClone(source)
  delete copied.productOwner
  const ownerOf = (id: number) => file.epics.find((entry) => entry.epicId === id)?.productOwner
  return { ...file, epics: [...file.epics.filter((entry) => !targets.some((epic) => epic.id === entry.epicId)), ...targets.map((epic) => { const owner = ownerOf(epic.id); return { ...structuredClone(copied), epicId: epic.id, epicTitle: epic.title, ...(owner ? { productOwner: { ...owner } } : {}) } })] }
}
// EPS-11: the Epic setup with an Epic's Product Owner set (undefined: none). An entry left with no fields, no title
// pattern and no Product Owner is removed.
export function withProductOwner(file: EpicSetupFile, epicId: number, epicTitle: string, owner: ProductOwner | undefined): EpicSetupFile {
  const known = file.epics.find((entry) => entry.epicId === epicId)
  const clean = owner ? cleanProductOwner(owner) : undefined
  const next: EpicFields = { ...(known ? structuredClone(known) : { epicId, epicTitle, fields: [] }) }
  if (!next.epicTitle) next.epicTitle = epicTitle
  if (clean) next.productOwner = clean; else delete next.productOwner
  const rest = file.epics.filter((entry) => entry.epicId !== epicId)
  return { ...file, epics: next.fields.length || next.titlePattern || next.productOwner ? [...rest, next] : rest }
}
// EPS-11: an Epic's Feature fields and title pattern removed, its Product Owner kept.
export function withoutEpicFields(file: EpicSetupFile, epicId: number): EpicSetupFile {
  const known = file.epics.find((entry) => entry.epicId === epicId)
  const rest = file.epics.filter((entry) => entry.epicId !== epicId)
  return { ...file, epics: known?.productOwner ? [...rest, { epicId, epicTitle: known.epicTitle, fields: [], productOwner: { ...known.productOwner } }] : rest }
}
export const productOwnerOf = (file: EpicSetupFile | null | undefined, epicId: number | undefined): ProductOwner | undefined => epicId == null ? undefined : file?.epics.find((entry) => entry.epicId === epicId)?.productOwner
export function upsertEpicFields(file: EpicSetupFile, entry: EpicFields): EpicSetupFile {
  return { ...file, epics: [...file.epics.filter((item) => item.epicId !== entry.epicId), entry] }
}
export function upsertList(file: EpicSetupFile, list: ValueList): EpicSetupFile {
  return { ...file, lists: [...file.lists.filter((item) => item.id !== list.id), list] }
}
// A list still used by a field cannot be removed.
export const listUsedBy = (file: EpicSetupFile, id: string) => file.epics.filter((entry) => entry.fields.some((field) => field.type === 'list' && field.list === id)).map((entry) => entry.epicId)
export const newListId = (file: EpicSetupFile, name: string) => { const base = listId(name) || 'list'; let id = base, n = 2; while (file.lists.some((entry) => entry.id === id)) id = `${base}-${n++}`; return id }

// EPS-03 bulk creation: each release's values come from its on-prem items (the fields' On-prem field). An empty Block
// field skips the release; an empty Warn field creates it and is listed. A title pattern sets the Title (with
// {feature} as the title the stream gives); without one the stream's title is kept. The Description gets the lines.
export interface WithFields { title: string; skip?: string; fieldLines: string[]; warned: string[] }
// set: a field's value given by the row itself (DPF-08: the Release Classification picked in the pop-up), over the
// value read from the release.
export function withEpicFields<L extends { title: string; skip?: string }>(plan: L[], entry: EpicFields | undefined, itemsOf: (line: L) => Pick<AzureWorkItem, 'fields'>[], set?: { index: number; of: (line: L) => string }): (L & WithFields)[] {
  if (!entry) return plan.map((line) => ({ ...line, fieldLines: [], warned: [] }))
  const titleFields = asTitleFields(entry.fields)
  return plan.map((line) => {
    const values = fieldsFromItems(titleFields, itemsOf(line))
    if (set && set.index >= 0 && set.of(line).trim()) values[set.index] = set.of(line).trim()
    const result = featureFromFields(entry, values, line.title)
    const blocked = result.blocked.length ? `empty ${result.blocked.join(', ')} (Epic setup of #${entry.epicId})` : undefined
    return { ...line, title: entry.titlePattern ? result.title : line.title, ...(line.skip || blocked ? { skip: line.skip ?? blocked } : {}), fieldLines: result.lines, warned: result.warned }
  })
}

// DPF-07, DPF-09: the Release Classification values of an Epic — the list of its own "Release Classification" field
// (a List field); none without one (there are no built-in values). fieldIndex: that field's place in the Epic's
// fields, -1 without one.
// DPF-10: rules — the field's detection rules (none: the values are matched by the release type's name, as before).
export interface Classification { values: string[]; fieldIndex: number; label: string; rules: ClassRule[] }
export function classificationOf(file: EpicSetupFile | null | undefined, epicId: number | undefined): Classification {
  const entry = epicFieldsFor(file, epicId)
  const fieldIndex = entry ? entry.fields.findIndex((field) => fieldKey(field.label) === classificationKey) : -1
  if (fieldIndex < 0) return { values: [], fieldIndex: -1, label: 'Release Classification', rules: [] }
  const field = entry!.fields[fieldIndex]
  const list = field.type === 'list'
  return { values: list ? [...(listOf(file, field.list)?.values ?? [])] : [], fieldIndex, label: field.label, rules: list ? structuredClone(field.classRules ?? []) : [] }
}
/** The value of the release type read from the release number (Major, Minor, MLD, Platform Update) in an Epic's list. */
export const classificationFromType = (values: string[], type: string | undefined) => type ? values.find((value) => value.trim().toLowerCase() === type.toLowerCase()) ?? '' : ''

// DPF-10: the part of a release number that decides its classification — the deepest non-zero part of x.y.z.w (missing
// parts are 0, a leading "v" is ignored); null for anything that is not 1 to 4 numbers.
export function releasePartOf(version: string): ReleasePart | null {
  const value = version.trim().replace(/^v/i, '')
  if (!/^\d+(\.\d+){0,3}$/.test(value)) return null
  const [, y = 0, z = 0, w = 0] = value.split('.').map(Number)
  return w ? 'x.y.z.w' : z ? 'x.y.z' : y ? 'x.y' : 'x.0'
}
// The built-in names the release types had before the rules (DPF-08), by part.
const typeNames: Record<ReleasePart, string> = { 'x.0': 'Major', 'x.y': 'Minor', 'x.y.z': 'MLD', 'x.y.z.w': 'Platform Update' }
const usualNames: Record<ReleasePart, string[]> = { 'x.0': ['major'], 'x.y': ['minor'], 'x.y.z': ['mld'], 'x.y.z.w': ['platform update', 'pu'] }
/** DPF-11: the value of the Epic's list for a release number — by the rules when the field has any, else (no rules
 * saved) the value named like the release type (Major, Minor, MLD, Platform Update), as before; '' when none. */
export function detectClassification(classes: Pick<Classification, 'values' | 'rules'>, version: string): string {
  const part = releasePartOf(version)
  if (!part) return ''
  const inList = (name: string) => classes.values.find((value) => value.trim().toLowerCase() === name.trim().toLowerCase()) ?? ''
  if (!classes.rules.length) return classificationFromType(classes.values, typeNames[part])
  const rule = classes.rules.find((entry) => entry.parts.includes(part))
  return rule ? inList(rule.value) : ''
}
/** DPF-10 "Fill with the usual rules": x.0 → Major, x.y → Minor, x.y.z → MLD, x.y.z.w → Platform Update (or PU), for
 * the values of the list named so (any case). */
export function usualClassRules(values: string[]): ClassRule[] {
  const rules: ClassRule[] = []
  for (const part of releaseParts) {
    const value = values.find((entry) => usualNames[part.key].includes(entry.trim().toLowerCase()))
    if (!value) continue
    const known = rules.find((rule) => rule.value === value)
    if (known) known.parts.push(part.key); else rules.push({ value, parts: [part.key] })
  }
  return rules
}
/** DPF-10: what keeps the rules from being saved — a part given to more than one value — as messages. */
export function classRuleProblems(rules: ClassRule[] | undefined): string[] {
  return releaseParts.flatMap((part) => {
    const owners = (rules ?? []).filter((rule) => rule.parts.includes(part.key)).map((rule) => rule.value)
    return owners.length > 1 ? [`${part.key} is given to ${owners.join(' and ')}: a part of the release number may decide one value only.`] : []
  })
}
/** DPF-10: the rules after ticking or unticking a part for a value (a rule without parts is removed). */
export function toggleClassRule(rules: ClassRule[] | undefined, value: string, part: ReleasePart, on: boolean): ClassRule[] {
  const next = structuredClone(rules ?? [])
  let rule = next.find((entry) => entry.value === value)
  if (!rule) { rule = { value, parts: [] }; next.push(rule) }
  rule.parts = releaseParts.map((entry) => entry.key).filter((key) => key === part ? on : rule!.parts.includes(key))
  return next.filter((entry) => entry.parts.length)
}

// STT-01: the templates offered for an Epic and Release Classification value ('' = the Epic default): a template whose
// Epic tags are empty or name the Epic, and whose value tags are empty or (for a value) name it.
export function templatesFor(file: EpicSetupFile | null | undefined, epicId: number, value = ''): StoryTemplateItem[] {
  const wanted = value.trim().toLowerCase()
  return (file?.storyTemplates ?? []).filter((item) => (!item.epics.length || item.epics.includes(epicId)) && (!item.classes.length || (wanted !== '' && item.classes.some((tag) => tag.toLowerCase() === wanted))))
}
export function upsertStoryTemplate(file: EpicSetupFile, item: StoryTemplateItem): EpicSetupFile {
  return { ...file, storyTemplates: [...(file.storyTemplates ?? []).filter((entry) => entry.id !== item.id), item] }
}
export const newStoryTemplateId = (file: EpicSetupFile, title: string) => { const base = `t-${listId(title).slice(0, 50) || 'story'}`; let id = base, n = 2; while ((file.storyTemplates ?? []).some((entry) => entry.id === id)) id = `${base}-${n++}`; return id }
