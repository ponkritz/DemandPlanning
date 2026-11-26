import { useEffect, useMemo, useRef, useState } from 'react'
import type { AzureConnectionProfileSummary } from './azureCredentials'
import { missingDataset, type Dataset } from './dashboardPages'
import { querySource, serverKeyOf, serverLabel, type AzureQueryRef } from './azureQueryRef'
import { patForServer, queryDataset, queryFailure, queryReadReason, readSavedQuery, type QueryResult } from './azureQuerySources'
import { formatDateTime } from './format'

// DSH-19, DSH-22 The saved Azure queries of a dashboard as data sources, read with the viewer's own PAT when the
// dashboard opens — only those a block or a filter uses, all of them while the block pop-up is open — and again with
// ↻ Refresh Azure queries (no polling). The rows stay in this page's memory only: never in Git, a backup or the browser.
type Read = { state: 'reading'; previous?: QueryResult } | { state: 'done'; result: QueryResult } | { state: 'failed'; error: string }
const kind = 'Azure DevOps query'
const readKey = (ref: AzureQueryRef) => `${serverKeyOf(ref.server)}|${ref.project.toLowerCase()}|${ref.queryId}`

export function useAzureQueries(refs: AzureQueryRef[], wanted: (key: string) => boolean, options: { profiles: AzureConnectionProfileSummary[]; viewingAs?: boolean }) {
  const [reads, setReads] = useState<Record<string, Read>>({})
  const [round, setRound] = useState(0)
  const started = useRef(new Set<string>())
  // The reads run on after a re-render (the list of reads to start empties at once); only leaving the page drops them.
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const { profiles, viewingAs = false } = options
  const pats = useMemo(() => Object.fromEntries(refs.map((ref) => [ref.id, patForServer(ref.server, profiles)])), [refs, profiles])
  const todo = refs.filter((ref) => wanted(querySource(ref.id)) && !queryReadReason(ref, pats[ref.id] ?? '', viewingAs) && !started.current.has(`${round}:${readKey(ref)}`))
  const todoKey = todo.map((ref) => ref.id).join(',')
  useEffect(() => {
    if (!todo.length) return
    void (async () => {
      for (const ref of todo) {
        const key = readKey(ref)
        if (started.current.has(`${round}:${key}`)) continue
        started.current.add(`${round}:${key}`)
        setReads((current) => { const before = current[key]; return { ...current, [key]: { state: 'reading', ...(before?.state === 'done' ? { previous: before.result } : before?.state === 'reading' && before.previous ? { previous: before.previous } : {}) } } })
        const pat = pats[ref.id] ?? ''
        try {
          const result = await readSavedQuery(ref, pat)
          if (mounted.current) setReads((current) => ({ ...current, [key]: { state: 'done', result } }))
        } catch (failure) {
          if (mounted.current) setReads((current) => ({ ...current, [key]: { state: 'failed', error: queryFailure(failure, pat) } }))
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoKey, round])

  const datasets = refs.map((ref): Dataset => {
    const key = querySource(ref.id)
    const blocked = (problem: string): Dataset => ({ ...missingDataset(key, problem), name: ref.name, kind })
    const reason = queryReadReason(ref, pats[ref.id] ?? '', viewingAs)
    if (reason) return blocked(reason)
    const read = reads[readKey(ref)]
    const result = read?.state === 'done' ? read.result : read?.state === 'reading' ? read.previous : undefined
    if (read?.state === 'failed') return blocked(read.error)
    if (!result) return blocked(`Reading ${ref.name} from Azure DevOps with your PAT…`)
    return queryDataset(key, ref.name, kind, `The saved query ${ref.name} on ${serverLabel(ref.server)}, project ${ref.project}, read from Azure DevOps with your own PAT at ${formatDateTime(result.readAt ?? '')}`, result)
  })
  const reading = Object.values(reads).some((read) => read.state === 'reading')
  // ↻ Refresh Azure queries: every used query read again (the rows shown until the new ones are there).
  const refresh = () => setRound((value) => value + 1)
  return { datasets, refresh, reading }
}
