// PIR-43 Safe text for the PI Review Meeting file, shared by the slide makers (piMeeting.ts, piMeetingExec.ts): every
// value goes through `text()` — e-mail addresses and identity ids are taken out and the rest HTML-escaped — so comment
// text from Azure DevOps can never become markup or script; people by their display name only.
import { escapeHtml } from './standaloneHtml.ts'

// PIR-43: no e-mail address and no identity id (a GUID, also as "@<GUID>") reaches the file; then HTML-escaped.
const emailPattern = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[A-Za-z]{2,}/g
const identityPattern = /@?<?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b>?/gi
export const scrub = (value: unknown) => String(value ?? '').replace(identityPattern, '[id]').replace(emailPattern, '[email]')
export const text = (value: unknown) => escapeHtml(scrub(value))
// A person: the display name only ("Rita Gomez <rita@…>" → "Rita Gomez"); "Unknown" when nothing is left.
export const displayName = (value: unknown) => { const name = scrub(String(value ?? '').replace(/<[^>]*>/g, ' ')).replace(/\[email\]|\[id\]/g, ' ').replace(/\s+/g, ' ').trim(); return name || 'Unknown' }
export const lines = (value: string) => value.split(/\r?\n/).map((line) => line.trim().replace(/^(?:[-*•+–◦▪]|\d{1,2}[.)])[ \t]+(?=\S)/, '')).filter(Boolean)
export const plural = (count: number, word: string, many = `${word}s`) => `${count.toLocaleString('en')} ${count === 1 ? word : many}`
// PIR-64: how long lists and texts split over slides is worked out from the 16:9 canvas (piMeetingLayout.ts).
