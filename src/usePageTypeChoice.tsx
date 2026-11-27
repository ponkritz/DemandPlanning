import { useState } from 'react'
import type { PageKind } from './menuLayout'
import { newQueryRef } from './azureQueryRef'
import { defaultTicks, newPageType, pageTypeOf, type TypeTicks } from './pageType'
import { useAzureQueryPicker, type QueryPickerOptions } from './useAzureQueryPicker'
import { PageTypeField } from './components/PageTypeField'

// PGB-22, PGB-23: the page type of a new page (Add page, Tool Validations ＋ Add tab…) — the ticks, and with Table (Query)
// the query picker of the dashboards (DSH-18). result: the type and source to create, or why the main button is disabled.
export function usePageTypeChoice(azure: QueryPickerOptions, onEdit: () => void, hideStreamNote = false) {
  const [ticks, setTicks] = useState<TypeTicks>(defaultTicks)
  const picker = useAzureQueryPicker(azure, { nameLabel: 'Query name', nameHelp: 'How the query is named on the page (at most 80 characters).', radioName: 'page-query-how', onEdit })
  const type = pageTypeOf(ticks)
  const query = typeof type !== 'string' && type.kind !== 'dashboard' && type.source === 'query'
  const ref = query && picker.target && !picker.missing ? newQueryRef({ name: picker.name, ...picker.target }, [], 'q1') : null
  const result = typeof type === 'string' ? type : query && picker.missing ? picker.missing : typeof ref === 'string' ? ref : newPageType(ticks, ref)
  const field = <>
    <PageTypeField ticks={ticks} onChange={(next) => { setTicks(next); onEdit() }} hideStreamNote={hideStreamNote} />
    {query && picker.fields}
  </>
  return { field, result, kind: typeof type === 'string' ? 'table' as PageKind : type.kind, query }
}
