import type { AzureWorkItem } from './domain'
import { approvalDateFrom, approvalMonthOf } from './releaseSource.ts'
import { releaseFor } from './releasePath.ts'
import type { NamingPattern } from './namingPatterns.ts'
import type { ReleaseRule } from './streams.ts'
import { parseExportDate, windchillReleases, type ReleaseOptions } from './windchillReleases.ts'
import { windchillCell } from './windchillViews.ts'

// MYD-13: the releases and documents a person signed, from every stream that has the data. A document is signed by
// the person when their name or work email is in one of its signature fields: any field (Azure DevOps) or column
// (Windchill export) whose name says Author, Reviewer or Approver — not a date, function, role or comment. Its date is
// the person's own signature date when the field has one (the date field of the same role and slot, e.g.
// ApproverName7 → ApproverApprovalDate7), else the document's approval date (Author Approval Date, else Closed Date;
// Windchill: its date column). A release counts once the person signed any one of its documents in the period.

export interface Signer { names: string[]; email?: string }
export interface SignedDocument { stream: string; release: string; document: string; id?: number; url?: string; field: string; date?: string; month?: string }

const roleWord = /author|reviewer|approver/i
const notAName = /date|function|role|comment|status|time|count|level|approval\s*date/i
export const isSignatureField = (name: string) => roleWord.test(name) && !notAName.test(name.replace(/name/i, ''))
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')
const words = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}@.\s-]/gu, ' ').split(/\s+/).filter(Boolean)

// Whether a field's value names the person: their work email anywhere in it, or all the words of one of their names
// in any order (so "Costa, Ana" and "Ana Costa" both match), in any of the names a field lists (; or , separated).
export function namesSigner(value: unknown, signer: Signer) {
  if (typeof value !== 'string' || !value.trim()) return false
  const text = value.toLowerCase()
  const email = signer.email?.trim().toLowerCase()
  if (email && text.includes(email)) return true
  const present = new Set(words(value))
  return signer.names.some((name) => { const wanted = words(name); return wanted.length > 0 && wanted.every((word) => present.has(word)) })
}

// The person's own signature date for a signature field: a date field of the same role word and the same slot number.
export function signatureDateFor(fields: Record<string, unknown>, field: string): string | undefined {
  const role = roleWord.exec(field)?.[0].toLowerCase()
  const slot = /(\d+)\s*$/.exec(field)?.[1]
  const candidates = Object.keys(fields).filter((key) => key !== field && /date/i.test(key) && (!role || squash(key).includes(role)) && (slot ? new RegExp(`(?<!\\d)${slot}\\s*$`).test(key) : !/\d\s*$/.test(key)))
  for (const key of candidates) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim()) {
      if (/^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))) return value
      const at = parseExportDate(value)
      if (at !== undefined) return new Date(at).toISOString()
    }
  }
  return undefined
}

// Azure DevOps stream items (the read-only views): one entry per document signed by the person.
export function azureSignatures(items: AzureWorkItem[], stream: string, signer: Signer, rule: ReleaseRule, patterns: NamingPattern[] = [], timeZone?: string, area?: string[]): SignedDocument[] {
  const found: SignedDocument[] = []
  for (const item of items) {
    const fields = item.fields ?? {}
    const field = Object.keys(fields).find((key) => isSignatureField(key) && namesSigner(fields[key], signer))
    if (!field) continue
    const date = signatureDateFor(fields, field) ?? item.approvalDate ?? approvalDateFrom(fields) ?? item.closedDate
    const release = releaseFor(item, rule, patterns, area)
    found.push({ stream, release: release ? [release.group, release.name, release.release].filter(Boolean).join(' ') : item.title, document: item.title, id: item.id, url: item.url, field, ...(date ? { date, month: approvalMonthOf(date, timeZone) } : {}) })
  }
  return found
}

// A Windchill export: each document of each release it names, signed by the person.
export function windchillSignatures(rows: Record<string, unknown>[], columns: string[], stream: string, signer: Signer, options: ReleaseOptions = {}): SignedDocument[] {
  const signatureColumns = columns.filter(isSignatureField)
  if (!signatureColumns.length) return []
  const docDate = columns.find((column) => /last modified|modified|released|date/i.test(column) && !roleWord.test(column))
  const found: SignedDocument[] = []
  for (const release of windchillReleases(rows, columns, options).releases) {
    for (const document of release.documents) {
      const row = document.row
      const field = signatureColumns.find((column) => namesSigner(windchillCell(row, column), signer))
      if (!field) continue
      const own = signatureDateFor(Object.fromEntries(columns.map((column) => [column, windchillCell(row, column)])), field)
      const at = own ?? (docDate ? (() => { const stamp = parseExportDate(windchillCell(row, docDate)); return stamp === undefined ? undefined : new Date(stamp).toISOString() })() : undefined)
      found.push({ stream, release: [release.name, release.release].filter(Boolean).join(' '), document: document.name, field, ...(at ? { date: at, month: at.slice(0, 7) } : {}) })
    }
  }
  return found
}

// Per stream and in total, the documents and the distinct releases signed in the period (months from–to, inclusive);
// a document without a date is not counted in any period.
export interface SignedSummary { stream: string; documents: number; releases: number; signed: SignedDocument[] }
export function signedInPeriod(signed: SignedDocument[], from: string, to: string, streams: string[]) {
  const [start, end] = from <= to ? [from, to] : [to, from]
  const inPeriod = signed.filter((entry) => entry.month && entry.month >= start && entry.month <= end)
  const summary = (list: SignedDocument[], stream: string): SignedSummary => ({ stream, documents: list.length, releases: new Set(list.map((entry) => `${entry.stream}\u0000${entry.release.toLowerCase()}`)).size, signed: list })
  return { streams: streams.map((stream) => summary(inPeriod.filter((entry) => entry.stream === stream), stream)), total: summary(inPeriod, 'All streams'), undated: signed.filter((entry) => !entry.month).length }
}
