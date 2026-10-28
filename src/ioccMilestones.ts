import type { AzureWorkItem } from './domain'
import { ioccRelease } from './releasePath.ts'
import { approvalDateFrom, approvalMonthOf } from './releaseSource.ts'

// IOCC Completed and Supported Releases in a month (QV-36), counted like DP (dpMilestones): each release once.
// A release is Completed when its Release Notes or its Verification Report is signed (Author Approval Date) in the
// month; it is Supported when any of its Release Plan, Release Notes or Verification Report is signed in the month —
// so, as for DP, the Completed Releases are also Supported. The document type is read from the Title.
export type IoccDocument = 'release-plan' | 'release-notes' | 'verification-report'
export const ioccDocumentNames: Record<IoccDocument, string> = { 'release-plan': 'Release Plan', 'release-notes': 'Release Notes', 'verification-report': 'Verification Report' }
const completing: IoccDocument[] = ['release-notes', 'verification-report']

export function ioccDocumentOf(title: string | undefined): IoccDocument | undefined {
  const text = (title ?? '').toLowerCase()
  if (/\bverification\b.*\breport\b/.test(text)) return 'verification-report'
  if (/\brelease\s*notes?\b/.test(text) || /\bnotes?\b/.test(text)) return 'release-notes'
  if (/\brelease\s*plan\b/.test(text) || (/\bplan\b/.test(text) && /\brelease\b/.test(text) && !/\b(?:test|verification|validation|risk|qualification)\s*plan\b/.test(text))) return 'release-plan'
  return undefined
}

// The release a document belongs to: the Type of Release (Area Path after IOCC), the Title without its version and
// without the document words, and the version — so a release's plan, notes and report are one release.
const documentWords = /\b(?:release\s*notes?|notes?|verification(?:\s+summary)?\s*report|release\s*plan|plan)\b/gi
export function ioccReleaseOf(item: Pick<AzureWorkItem, 'areaPath' | 'title'>) {
  const found = ioccRelease(item)
  if (!found) return undefined
  const separator = /\s*[|:_–-]\s*/
  const name = found.name.replace(documentWords, ' ').replace(new RegExp(`(?:${separator.source}){2,}`, 'g'), ' - ').replace(new RegExp(`^(?:${separator.source})+|(?:${separator.source})+$`, 'g'), '').replace(/\s+/g, ' ').trim() || found.name
  return { group: found.group ?? '', name, release: found.release, key: `${found.group ?? ''}\u0000${name}\u0000${found.release}`.toLowerCase() }
}

export interface IoccSigned { item: AzureWorkItem; document: IoccDocument; date: string }
export interface IoccRelease { key: string; group: string; name: string; release: string; documents: IoccSigned[]; date: string }

function unique(entries: IoccSigned[]): IoccRelease[] {
  const byKey = new Map<string, IoccRelease>()
  for (const entry of entries) {
    const release = ioccReleaseOf(entry.item)
    if (!release) continue
    const found = byKey.get(release.key)
    if (found) { found.documents.push(entry); if (entry.date > found.date) found.date = entry.date; continue }
    byKey.set(release.key, { ...release, documents: [entry], date: entry.date })
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
}

export function ioccMonthCounts(items: AzureWorkItem[], month: string, timeZone?: string) {
  const signed: IoccSigned[] = []
  for (const item of items) {
    const document = ioccDocumentOf(item.title)
    const date = item.approvalDate ?? approvalDateFrom(item.fields ?? {})
    if (document && date && approvalMonthOf(date, timeZone) === month) signed.push({ item, document, date })
  }
  signed.sort((a, b) => a.date.localeCompare(b.date) || a.item.id - b.item.id)
  return { completed: unique(signed.filter((entry) => completing.includes(entry.document))), supported: unique(signed), documents: signed }
}
