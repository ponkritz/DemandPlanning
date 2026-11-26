import type { QeMapColumns, QePageSetting } from './featureSetup.ts'
import { cellText, currentValue, type OnDemandColumn, type OnDemandPage } from './onDemand.ts'

// DPF-02, EPS-09: the QE of a release comes from an On-Demand Table page (QE Mapping was removed, NAV-54) — the page and
// two of its columns chosen in the Feature setup of the DP / IOCC bulk creation Epic, by id so that a rename keeps them:
// the column with the Platform / Product and the column with the QE. No column is built in. Until a bulk Epic's setup
// names a page, the page named "Resource Mapping" (if there is one) is offered as the default; its columns are still
// chosen by hand.
export const defaultQePageName = 'Resource Mapping'
const normalName = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')

export interface QePageRef { id: string; name: string; columns: OnDemandColumn[] }
// The page a setup uses: its own, else the default page (defaulted: true, no columns yet).
export function resolveQePage(setting: QePageSetting | undefined, pages: Pick<QePageRef, 'id' | 'name'>[]): { setting?: QePageSetting; defaulted: boolean } {
  if (setting) return { setting, defaulted: false }
  const page = pages.find((entry) => normalName(entry.name) === normalName(defaultQePageName))
  return page ? { setting: { pageId: page.id, matchColumn: '', qeColumn: '' }, defaulted: true } : { defaulted: false }
}

// The columns offered: Platform / Product — any column of text or values; QE — a Text column or a Dropdown (also one
// with a built-in list, LST: its display name is used).
export const matchColumnChoices = (page: Pick<QePageRef, 'columns'> | null | undefined) => (page?.columns ?? []).filter((column) => ['text', 'longtext', 'dropdown', 'multi'].includes(column.type))
export const qeColumnChoices = (page: Pick<QePageRef, 'columns'> | null | undefined) => (page?.columns ?? []).filter((column) => column.type === 'text' || column.type === 'dropdown')

// The QE page's rows as product → QE (both as shown: a built-in list value by the name the list has now), or why
// there are none: 'not-set' (no page or a column not chosen, or no longer on the page), 'missing' (the page is not
// there or not loaded).
export interface QeEntry { product: string; qe: string }
export type QeSource = { rows: QeEntry[] } | { problem: 'not-set' | 'missing' }
export function qeSourceOf(page: OnDemandPage | null | undefined, setting: QePageSetting | undefined): QeSource {
  if (!setting?.pageId || !setting.matchColumn || !setting.qeColumn) return { problem: 'not-set' }
  if (!page || page.id !== setting.pageId) return { problem: 'missing' }
  const match = page.columns.find((column) => column.id === setting.matchColumn), qe = page.columns.find((column) => column.id === setting.qeColumn)
  if (!match || !qe) return { problem: 'not-set' }
  const shown = (column: OnDemandColumn, row: OnDemandPage['rows'][number]) => cellText(currentValue(column, row)).trim()
  return { rows: page.rows.filter((row) => !row.hidden).map((row) => ({ product: shown(match, row), qe: shown(qe, row) })).filter((entry) => entry.product && entry.qe) }
}

// EPS-09: an older setup that names only QE Mapping columns (qeColumns) — they are not guessed on the page; the setup
// says to choose them again.
export const needsQePage = (setup: { qeColumns?: QeMapColumns; qePage?: QePageSetting } | undefined) => Boolean(setup?.qeColumns && !setup.qePage)
export const oldQeColumnsHint = (columns: QeMapColumns) => `The old QE Mapping columns (“${columns.matchColumn}”, “${columns.qeColumn}”) need choosing again on the QE page.`
