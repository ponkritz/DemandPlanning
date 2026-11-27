// PIR-47 Where a PI Review Meeting (src/piMeeting.ts) is kept in the Git data repository, and the only paths that are read
// or written there. Small and without dependencies, so Git storage (useGitStorage) can check a path without loading the
// presentation builder.
// PIR-47: pi-review/meetings/PI-<pi>/PI-Review-Meeting-PI-<pi>-<yyyy-mm-dd-hhmm>.html in the Git data repository (next to
// the planning data), the time in the builder's time zone; "-2", "-3" … when that minute is taken.
export const meetingsFolder = 'pi-review/meetings'
export const piSlug = (pi: string) => (pi.replace(/^PI[\s._-]*/i, '').replace(/[^A-Za-z0-9.]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40)) || 'PI'
export const meetingFolder = (pi: string) => `${meetingsFolder}/PI-${piSlug(pi)}`
const two = (value: number) => String(value).padStart(2, '0')
export const meetingStamp = (at: Date) => `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`
export const meetingFileName = (pi: string, at: Date, taken: readonly string[] = []) => {
  const base = `PI-Review-Meeting-PI-${piSlug(pi)}-${meetingStamp(at)}`
  for (let index = 1; ; index += 1) { const name = `${base}${index > 1 ? `-${index}` : ''}.html`; if (!taken.includes(name)) return name }
}
export const meetingPath = (pi: string, at: Date, taken: readonly string[] = []) => `${meetingFolder(pi)}/${meetingFileName(pi, at, taken)}`
const pathPattern = /^pi-review\/meetings\/PI-([A-Za-z0-9](?:[A-Za-z0-9.-]{0,38}[A-Za-z0-9])?)\/PI-Review-Meeting-PI-([A-Za-z0-9.-]{1,40})-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-(\d{1,3}))?\.html$/
// Only such a path is read or written (no "..", no other folder or file type).
export const isMeetingPath = (path: string) => { const found = pathPattern.exec(path); return Boolean(found && found[1] === found[2] && !path.includes('..')) }
// The time a saved meeting was built, from its file name (the builder's local time), for the list.
export function meetingBuiltOf(path: string): string {
  const found = pathPattern.exec(path)
  return found ? `${found[3]}-${found[4]}-${found[5]} ${found[6]}:${found[7]}` : ''
}
// PIR-47: the largest file kept in Git (larger ones are downloaded only).
export const maxMeetingBytes = 5 * 1024 * 1024
export const meetingBytes = (html: string) => new TextEncoder().encode(html).length
