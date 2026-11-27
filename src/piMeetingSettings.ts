// PIR-51…PIR-62 The settings of the PI Review Meeting presentation (product owner, 26 Nov 2026), kept with the PI Review
// form setup in Git (pi-review-form.json, `meeting`; schema 2 — a file without them, schema 1, still loads with the
// defaults below) and edited in Admin → Feature & PI setup → PI Review form → Meeting presentation by the holders of
// "PI Review: set up the review form" (others read only):
// - the release-based streams whose releases and long-running Features the meeting shows (none ticked by default);
// - "Long-running after (months)" (PIR-85): a number of calendar months per Epic of those streams, and a default for
//   the others (6). Saved as meeting.longRunningMonths / longRunningMonthsDefault; the PI-based values of PIR-57
//   (meeting.longRunning / longRunningDefault) are not converted: a file holding them loads with the defaults and says
//   so (oldPiLimits), and they are dropped at the next save. The file stays schema 2 (an older app refuses any other
//   schema; it ignores the new keys and keeps its own PI default);
// - the title slide (Title, Subtitle) and the footer text, with the placeholders {PI} {date} {time} {builtBy} {team};
// - the accent colour (#rrggbb, refused when its contrast with white is below WCAG AA 4.5:1) and a light or dark title
//   slide (dark: the accent fills the title slide with white text — the same contrast check);
// - the order of the Epics on every per-Epic slide: Epic ID (ascending, the default) or Number of Features (most first).
// Pure: nothing here touches the DOM, Git or the network.

export type EpicOrder = 'id' | 'features'
export type TitleTheme = 'light' | 'dark'
export interface MeetingSettings {
  streams: string[]
  longRunningMonthsDefault: number
  // Epic ID (as text) → N months.
  longRunningMonths: Record<string, number>
  epicOrder: EpicOrder
  title: string
  subtitle: string
  footer: string
  team: string
  accent: string
  titleTheme: TitleTheme
  // PIR-85: the file still held the PI-based long-running limits of PIR-57 (not used; set the months again). Never written.
  oldPiLimits?: boolean
}
export const meetingPlaceholders = ['{PI}', '{date}', '{time}', '{builtBy}', '{team}'] as const
export const defaultLongRunning = 6
export const maxLongRunning = 120
export const defaultAccent = '#0b5394'
export const maxTitle = 120, maxSubtitle = 200, maxFooter = 160, maxTeam = 60, maxStreams = 40, maxLongRunningEpics = 200
export const defaultMeetingSettings = (): MeetingSettings => ({
  streams: [], longRunningMonthsDefault: defaultLongRunning, longRunningMonths: {}, epicOrder: 'id',
  title: 'PI Review Meeting — PI {PI}', subtitle: 'Built {date}, {time} by {builtBy}', footer: 'PI Review Meeting — PI {PI} · built {date}, {time}', team: '',
  accent: defaultAccent, titleTheme: 'light',
})
export const epicOrderLabel: Record<EpicOrder, string> = { id: 'Epic ID (ascending)', features: 'Number of Features (most first)' }

// ---- WCAG AA contrast ----
export const isHexColour = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
const channel = (hex: string, at: number) => { const value = parseInt(hex.slice(at, at + 2), 16) / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4 }
export const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
export function contrastRatio(a: string, b: string) { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return Math.round((high + 0.05) / (low + 0.05) * 100) / 100 }
export const minContrast = 4.5
// Why the colour choice is refused ('' when it is fine): the accent is text on white on every slide, and with a dark
// title slide also its background under white text — both need 4.5:1 (WCAG AA, normal text).
export function colourProblem(accent: string, theme: TitleTheme): string {
  if (!isHexColour(accent)) return `Accent colour: “${accent}” is not a colour written #rrggbb.`
  const ratio = contrastRatio(accent, '#ffffff')
  if (ratio < minContrast) return `Accent colour ${accent.toLowerCase()}: its contrast with white is ${ratio.toFixed(2)}:1, below the ${minContrast}:1 of WCAG AA — ${theme === 'dark' ? 'the white title on the dark title slide and ' : ''}the headings on white would be hard to read. Choose a darker colour.`
  return ''
}

// ---- placeholders ----
export interface MeetingValues { pi: string; date: string; time: string; builtBy: string; team: string }
// {PI}: the PI's number ("PI 26.4" → "26.4"; a name without "PI " stays whole).
export const piNumber = (pi: string) => pi.trim().replace(/^PI\s+/i, '') || pi.trim()
// The text with its placeholders filled (plain text — escaped where it is written into the file).
export function fillPlaceholders(template: string, values: MeetingValues): string {
  const map: Record<string, string> = { '{PI}': piNumber(values.pi), '{date}': values.date, '{time}': values.time, '{builtBy}': values.builtBy, '{team}': values.team }
  return template.replace(/\{(?:PI|date|time|builtBy|team)\}/g, (found) => map[found] ?? found).replace(/\s+/g, ' ').trim()
}
const unknownPlaceholders = (text: string) => [...text.matchAll(/\{[^{}]*\}/g)].map((found) => found[0]).filter((found) => !(meetingPlaceholders as readonly string[]).includes(found))

// ---- problems, parse, serialize ----
const isCount = (value: unknown, max = maxLongRunning): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
export function meetingSettingsProblems(settings: MeetingSettings): string[] {
  const problems: string[] = []
  const line = (label: string, text: string, max: number, required = false) => {
    if (required && !text.trim()) problems.push(`${label}: enter a text.`)
    if (text.length > max) problems.push(`${label} is longer than ${max} characters.`)
    if (/[\r\n]/.test(text)) problems.push(`${label} is one line.`)
    const unknown = unknownPlaceholders(text)
    if (unknown.length) problems.push(`${label}: ${unknown.join(', ')} is not a placeholder (use ${meetingPlaceholders.join(' ')}).`)
  }
  line('Title', settings.title, maxTitle, true)
  line('Subtitle', settings.subtitle, maxSubtitle)
  line('Footer text', settings.footer, maxFooter)
  if (settings.team.length > maxTeam || /[\r\n{}]/.test(settings.team)) problems.push(`Team name: one line of at most ${maxTeam} characters, without { }.`)
  const colour = colourProblem(settings.accent, settings.titleTheme)
  if (colour) problems.push(colour)
  if (settings.titleTheme !== 'light' && settings.titleTheme !== 'dark') problems.push('Title slide: light or dark.')
  if (settings.epicOrder !== 'id' && settings.epicOrder !== 'features') problems.push('Order Epics by: Epic ID or Number of Features.')
  if (settings.streams.length > maxStreams) problems.push(`At most ${maxStreams} release-based streams.`)
  if (!isCount(settings.longRunningMonthsDefault)) problems.push(`Long-running after (months), default: a whole number from 1 to ${maxLongRunning}.`)
  const epics = Object.entries(settings.longRunningMonths)
  if (epics.length > maxLongRunningEpics) problems.push(`Long-running after (months): at most ${maxLongRunningEpics} Epics.`)
  for (const [epic, count] of epics) {
    if (!/^\d{1,9}$/.test(epic)) problems.push(`Long-running after (months): “${epic}” is not an Epic ID.`)
    else if (!isCount(count)) problems.push(`Long-running after (months), Epic #${epic}: a whole number from 1 to ${maxLongRunning}.`)
  }
  return problems
}
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
// The strict reader of the `meeting` part (missing parts take the defaults; anything malformed is refused with the reason).
export function parseMeetingSettings(value: unknown, file = 'pi-review-form.json'): MeetingSettings {
  const base = defaultMeetingSettings()
  if (value === undefined) return base
  const input = record(value)
  if (!input) throw new Error(`${file}: meeting (the Meeting presentation settings) is not an object.`)
  const text = (key: keyof MeetingSettings) => { const found = input[key]; if (found === undefined) return base[key] as string; if (typeof found !== 'string') throw new Error(`${file}: meeting.${key} is not a text.`); return found.trim() }
  const streams = input.streams === undefined ? [] : input.streams
  if (!Array.isArray(streams) || !streams.every((entry) => typeof entry === 'string')) throw new Error(`${file}: meeting.streams is not a list of stream names.`)
  const longRunning = input.longRunningMonths === undefined ? {} : record(input.longRunningMonths)
  if (!longRunning) throw new Error(`${file}: meeting.longRunningMonths is not a map of Epic IDs to months.`)
  // PIR-85: the PI-based limits of PIR-57 are not read (a number of PIs is not a number of months): the defaults apply.
  const oldPiLimits = input.longRunningDefault !== undefined || input.longRunning !== undefined
  const settings: MeetingSettings = {
    streams: [...new Set((streams as string[]).map((entry) => entry.trim()).filter(Boolean))],
    longRunningMonthsDefault: input.longRunningMonthsDefault === undefined ? base.longRunningMonthsDefault : input.longRunningMonthsDefault as number,
    longRunningMonths: Object.fromEntries(Object.entries(longRunning).map(([epic, count]) => [epic.trim(), count as number])),
    epicOrder: (input.epicOrder ?? base.epicOrder) as EpicOrder,
    title: text('title'), subtitle: text('subtitle'), footer: text('footer'), team: text('team'),
    accent: text('accent').toLowerCase(), titleTheme: (input.titleTheme ?? base.titleTheme) as TitleTheme,
    ...(oldPiLimits ? { oldPiLimits: true } : {}),
  }
  const problems = meetingSettingsProblems(settings)
  if (problems.length) throw new Error(`${file}: the Meeting presentation settings cannot be used: ${problems.join(' ')}`)
  return settings
}
// Only what differs from the defaults is written (a file stays short; a default changed later applies).
export function serializeMeetingSettings(settings: MeetingSettings): Record<string, unknown> | undefined {
  const base = defaultMeetingSettings(), out: Record<string, unknown> = {}
  if (settings.streams.length) out.streams = [...settings.streams]
  if (settings.longRunningMonthsDefault !== base.longRunningMonthsDefault) out.longRunningMonthsDefault = settings.longRunningMonthsDefault
  if (Object.keys(settings.longRunningMonths).length) out.longRunningMonths = Object.fromEntries(Object.entries(settings.longRunningMonths).sort((a, b) => Number(a[0]) - Number(b[0])))
  for (const key of ['epicOrder', 'title', 'subtitle', 'footer', 'team', 'accent', 'titleTheme'] as const) if (settings[key] !== base[key]) out[key] = settings[key]
  return Object.keys(out).length ? out : undefined
}
export const sameMeetingSettings = (a: MeetingSettings | undefined, b: MeetingSettings | undefined) => Boolean(a?.oldPiLimits) === Boolean(b?.oldPiLimits) && JSON.stringify(serializeMeetingSettings(a ?? defaultMeetingSettings()) ?? null) === JSON.stringify(serializeMeetingSettings(b ?? defaultMeetingSettings()) ?? null)
// N months of an Epic: its own value, else the default.
export const longRunningOf = (settings: Pick<MeetingSettings, 'longRunningMonths' | 'longRunningMonthsDefault'>, epicId: number | undefined) => (epicId != null ? settings.longRunningMonths[String(epicId)] : undefined) ?? settings.longRunningMonthsDefault
// PIR-85: the date N calendar months after a day (YYYY-MM-DD; the month's last day when it is shorter: 31 Aug + 6 → 28 Feb).
export function addMonths(date: string, months: number): string {
  const [year, month, dayOf] = date.split('-').map(Number), total = month - 1 + months
  const toYear = year + Math.floor(total / 12), toMonth = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(toYear, toMonth + 1, 0)).getUTCDate()
  return `${String(toYear).padStart(4, '0')}-${String(toMonth + 1).padStart(2, '0')}-${String(Math.min(dayOf, last)).padStart(2, '0')}`
}
// PIR-85: long-running when the Created Date plus N calendar months is before the build day (exactly N months is not).
export const isLongRunning = (created: string, months: number, today: string) => addMonths(created, months) < today
export const monthsLabel = (months: number) => `${months} month${months === 1 ? '' : 's'}`
// PIR-85: the one-line note while a file still holds the PI-based limits.
export const oldPiLimitsNote = 'The long-running limits are now in months (default 6): the limits saved in PIs by an earlier version are not used — set them again here if they were set.'
// What changed, for the commit message.
export function meetingSettingsChanges(before: MeetingSettings, after: MeetingSettings): string[] {
  const changes: string[] = []
  if (before.streams.join('|') !== after.streams.join('|')) changes.push('release-based streams')
  if (before.longRunningMonthsDefault !== after.longRunningMonthsDefault || JSON.stringify(before.longRunningMonths) !== JSON.stringify(after.longRunningMonths) || Boolean(before.oldPiLimits) !== Boolean(after.oldPiLimits)) changes.push('long-running after (months)')
  if (before.epicOrder !== after.epicOrder) changes.push('Epic order')
  if (before.title !== after.title || before.subtitle !== after.subtitle || before.team !== after.team) changes.push('title slide')
  if (before.footer !== after.footer) changes.push('footer')
  if (before.accent !== after.accent || before.titleTheme !== after.titleTheme) changes.push('colours')
  return changes
}
