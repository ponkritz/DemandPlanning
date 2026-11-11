// CAP-46 Bucket rules: which month Time Writing Tasks are absence (and of which kind), training or other NPRA. Set in
// Settings → Capacity & periods → Bucket rules by roles that manage shared settings and shared in Git; without them the
// built-in words below apply (the same as before v5.2.0). Title words match whole words; a tag matches when it starts
// with the word. Letter case is ignored everywhere.
export interface BucketRules {
  unplannedWords: string[]; sickWords: string[]; ptoWords: string[]
  trainingWords: string[]; trainingTags: string[]; npraTags: string[]
}
export const bucketRuleKeys = ['unplannedWords', 'sickWords', 'ptoWords', 'trainingWords', 'trainingTags', 'npraTags'] as const
export type BucketRuleKey = typeof bucketRuleKeys[number]
export const defaultBucketRules: BucketRules = {
  unplannedWords: ['unplanned', 'emergency'], sickWords: ['sick', 'medical'], ptoWords: ['pto', 'vacation', 'holiday', 'annual leave', 'planned leave'],
  trainingWords: ['training', 'trainings'], trainingTags: ['training', 'trainings'], npraTags: ['npra'],
}
export const bucketRuleLabel: Record<BucketRuleKey, string> = {
  unplannedWords: 'Unplanned Leave: title words', sickWords: 'Sick Leave: title words', ptoWords: 'PTO: title words',
  trainingWords: 'Training under the absence Epic: title words', trainingTags: 'Training: tags', npraTags: 'Other NPRA: tags',
}

const word = /^[\p{L}\p{N}](?:[\p{L}\p{N} -]{0,38}[\p{L}\p{N}])?$/u
// A list read from the shared app data or the form: trimmed, lower case, letters / digits / spaces / hyphens only
// (1–40 characters), no duplicates, at most 20.
export function normalizeWords(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(list.flatMap((entry) => typeof entry === 'string' ? [entry.trim().toLowerCase().replace(/\s+/g, ' ')] : []).filter((entry) => word.test(entry)))].slice(0, 20)
}
// The rules read from the shared app data: each list checked; a list missing or emptied falls back to the built-in one,
// except the tag lists, which may be empty. Undefined when every list is the built-in one (nothing stored).
export function normalizeBucketRules(value: unknown): BucketRules | undefined {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Record<string, unknown>
  const rules = Object.fromEntries(bucketRuleKeys.map((key) => {
    const list = normalizeWords(input[key])
    return [key, list.length || (Array.isArray(input[key]) && key.endsWith('Tags')) ? list : [...defaultBucketRules[key]]]
  })) as unknown as BucketRules
  return bucketRuleKeys.every((key) => rules[key].join('|') === defaultBucketRules[key].join('|')) ? undefined : rules
}
export const rulesOf = (settings: { bucketRules?: BucketRules }) => settings.bucketRules ?? defaultBucketRules

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const titleRegex = new Map<string, RegExp>()
// Whole words (letters and digits on both sides do not count as part of the word).
export function titleHas(text: string, words: string[]) {
  if (!words.length) return false
  const key = words.join('|')
  let regex = titleRegex.get(key)
  if (!regex) { regex = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${words.map(escape).join('|')})(?:$|[^\\p{L}\\p{N}])`, 'iu'); titleRegex.set(key, regex) }
  return regex.test(text)
}
// A tag matches when it is the word or starts with it followed by a non-letter (e.g. "NPRA Hours" for "npra").
export const tagsHave = (tags: string | undefined, words: string[]) => (tags ?? '').split(';').map((tag) => tag.trim().toLowerCase()).some((tag) => words.some((entry) => tag === entry || (tag.startsWith(entry) && /[^\p{L}\p{N}]/u.test(tag.charAt(entry.length)))))

type Entry = { title: string; workItemType: string; tags?: string }
// Training under the Team Holidays and Training Epic: the Task or a User Story above it (not the shared Feature or the
// Epic) says a training word in its title or carries a training or NPRA tag.
export const isTrainingWorkBy = (rules: BucketRules, item: Entry, chain: Entry[] = []) => [item, ...chain].some((entry) => entry.workItemType !== 'Epic' && entry.workItemType !== 'Feature' && (titleHas(entry.title, rules.trainingWords) || tagsHave(entry.tags, [...rules.trainingTags, ...rules.npraTags])))
// The kind of a leave Task from its own title and the titles above it: Unplanned first, then Sick, then PTO.
export function absenceKindBy(rules: BucketRules, titles: string[]): 'PTO' | 'Sick Leave' | 'Unplanned Leave' | 'Other absence' {
  const text = titles.join(' ')
  if (titleHas(text, rules.unplannedWords)) return 'Unplanned Leave'
  if (titleHas(text, rules.sickWords)) return 'Sick Leave'
  if (titleHas(text, rules.ptoWords)) return 'PTO'
  return 'Other absence'
}
// NPRA anywhere: a training or NPRA tag on the Task or anything above it; training when it is a training tag.
export const isNpraTaskBy = (rules: BucketRules, task: Entry, chain: Entry[]) => [task, ...chain].some((item) => tagsHave(item.tags, [...rules.npraTags, ...rules.trainingTags]))
export const isTrainingTaggedBy = (rules: BucketRules, task: Entry, chain: Entry[]) => [task, ...chain].some((item) => tagsHave(item.tags, rules.trainingTags))
