import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { recordJob } from './backgroundJobs'
import { outcomeText } from './gitSaveQueue'
import { listReason, azureInputs, emptyFile, mappingFor, markMerged, mergeSource, mergeSummary, parseToolValidations, serializeToolValidations, streamSourceId, toolValidationsFile, azureFieldOptions, type Refused, type ToolValidationsFile } from './toolValidations'
import type { AzureWorkItem } from './domain'
import type { NamingPattern } from './namingPatterns'
import type { GitStorage } from './useGitStorage'
import type { PublishAuthorization } from './publishRun'
import type { Viewer } from './menuLayout'
import type { Dataset } from './dashboardPages'
import type { DataModeStore } from './useDataMode'
import type { MenuLayoutStore } from './useMenuLayout'
import type { OnDemandStore } from './useOnDemand'
import type { PersonalViewsStore } from './usePersonalViews'
import type { DashboardAzure, DashboardHours } from './pages/CustomDashboardPage'

// TVL-02: the Tool Validations master list from Git (tool-validations.json), read when Git storage is connected; the last
// good file read is kept in this browser so the list is shown while Git cannot be reached. A file that cannot be read
// as a whole keeps the list in use, with the reason. Saved queued and merged (GIT-17) by the Tool Owner and the list's
// co-owners (TVL-11); the results go to Background jobs (UI-STANDARDS §8).
// TVL-04: the tools of the Tool Validations query are appended whenever its data is fetched — shown at once to everyone
// (worked out here from the data fetched), and saved to Git by the app of someone who may edit the list.
const cacheKey = 'demand-planning-tool-validations-v1'
function cached(): { file: ToolValidationsFile; refused: Refused[] } { try { return parseToolValidations(localStorage.getItem(cacheKey)) } catch { return { file: emptyFile(), refused: [] } } }
function remember(text: string | null) { try { if (text) localStorage.setItem(cacheKey, text); else localStorage.removeItem(cacheKey) } catch { /* this visit only */ } }

// completionField: the completion date of the Tools query (TVL-20, releaseSourceSettings.toolValidations), the
// validation date of its tools unless the mapping names another (TVL-29).
export interface StreamData { items?: AzureWorkItem[]; fetchedAt?: string; patterns: NamingPattern[]; completionField?: string }
// blocked: why nothing can be saved here at all (Git not connected or read-only, the sample, View as); '' otherwise.
export interface ToolWriter { viewer: Pick<Viewer, 'email' | 'readOnly' | 'manager'>; blocked: string; by: string }
export function useToolValidations(git: GitStorage, stream: StreamData, writer: ToolWriter) {
  const scope = git.accessScope
  const { readToolValidations } = git
  const [state, setState] = useState<{ scope: string; file: ToolValidationsFile; refused: Refused[]; error: string; loaded: boolean }>(() => ({ scope: '', ...cached(), error: '', loaded: false }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readToolValidations()
      const parsed = parseToolValidations(read.text)
      remember(read.text)
      setState({ scope, file: parsed.file, refused: parsed.refused, error: '', loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readToolValidations])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope && Boolean(scope)
  const loaded = fresh && state.loaded && !state.error

  // A change saved to Git: shown at once, then the version written (merged with a save by someone else meanwhile).
  const save = useCallback(async (next: ToolValidationsFile, message: string, label: string) => {
    const text = serializeToolValidations(next)
    setState((current) => ({ ...current, file: next }))
    try {
      const result = await git.writeToolValidations(text, message)
      const parsed = parseToolValidations(result.text)
      remember(result.text)
      setState((current) => ({ ...current, file: parsed.file, refused: parsed.refused }))
      recordJob('tool-validations', label, { text: outcomeText(result) })
      return result
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      recordJob('tool-validations', label, { text: reason, failed: true })
      throw failure
    }
  }, [git])

  // TVL-04: the Tool Validations query's tools merged in memory, so everyone sees the latest fetch.
  const { items, fetchedAt, patterns, completionField } = stream
  // The time a tool is added when the fetch carries none (older saved data): when this app was opened.
  const [openedAt] = useState(() => new Date().toISOString().slice(0, 19) + 'Z')
  const streamSource = state.file.sources.find((source) => source.id === streamSourceId)
  const options = useMemo(() => azureFieldOptions(items ?? []), [items])
  const auto = useMemo(() => {
    if (!items?.length || !streamSource) return null
    const mapping = mappingFor(streamSource, options)
    if (!mapping.name) return null
    return mergeSource(state.file, streamSourceId, azureInputs(items, mapping, patterns, completionField), fetchedAt ?? openedAt, writer.by || undefined)
  }, [items, streamSource, options, patterns, completionField, state.file, fetchedAt, openedAt, writer.by])
  const pending = auto && auto.file !== state.file ? auto : null
  // Saved by the app of someone who may edit the list, once per fetch and version of the list.
  const tried = useRef('')
  const { by } = writer
  // TVL-11: why the viewer cannot change the list ('' when they can) — fail closed while it is not read.
  const reason = writer.blocked || (!scope ? 'Connect Git storage (Admin → Data & sharing) to change the master list; it is shared through Git.' : state.error && fresh ? `${toolValidationsFile} could not be read from Git, so it cannot be changed here: ${state.error}` : !loaded ? 'The master list is still being read from Git.' : listReason(writer.viewer, state.file))
  const allowed = !reason
  useEffect(() => {
    if (!pending || !allowed || !loaded) return
    const signature = `${fetchedAt}|${serializeToolValidations(state.file).length}|${pending.added.length}/${pending.updated.length}/${pending.gone.length}`
    if (tried.current === signature) return
    tried.current = signature
    const at = new Date().toISOString().slice(0, 19) + 'Z'
    void save(markMerged(pending.file, streamSourceId, at, by || undefined), `Tool Validations: ${mergeSummary(pending)} from the Tool Validations query`, 'Tool Validations · add tools from Azure DevOps').catch(() => undefined)
  }, [pending, allowed, loaded, fetchedAt, state.file, save, by])

  return {
    file: state.file, shown: pending?.file ?? state.file, pending, reason, refused: state.refused, error: fresh ? state.error : '', loaded, connected: Boolean(scope),
    save, reload: load, history: git.toolValidationsHistory, queue: git.queueState(toolValidationsFile), retry: () => git.retryQueued(toolValidationsFile),
  }
}
export type ToolValidationsStore = ReturnType<typeof useToolValidations>

// What the Tool Validations page needs from the app, provided once (App): the store, who may change the list and why
// not, the viewer's own expiry window (personal views) and the other sources' data.
export interface ToolValidationsEnv {
  store: ToolValidationsStore
  ownersReason: string // why the viewer cannot name co-owners
  who: string
  personalDays?: number
  setPersonalDays: (days: number | undefined) => void
  sources: SourceData
  // TVL-15…TVL-17: what the owners' tabs need — the On-Demand pages and the menu layout (each tab is an On-Demand page,
  // hidden from the menu), the viewer and their views, and the Time Writing hours of the dashboards.
  pages?: CustomTabsEnv
  // TVL-18: the master list and the expiry list as data sources of the dashboards (blocked with the reason for a role
  // that may not see Release Details).
  datasets: Dataset[]
}
export interface CustomTabsEnv { git: GitStorage; onDemand: OnDemandStore; menu: MenuLayoutStore; viewer: Viewer; me: string; views?: PersonalViewsStore; dataMode?: DataModeStore; publisherName: string; publisher: PublishAuthorization; hours?: DashboardHours; azure?: DashboardAzure }
// The data of the sources other than the stream's query: Azure DevOps connections fetched here, imported Windchill
// exports and the table pages of the app.
export interface SourceData {
  azure: { id: string; name: string; items?: AzureWorkItem[]; fetchedAt?: string }[]
  windchill: { id: string; name: string; columns: string[]; rows?: Record<string, unknown>[] }[]
  pages: { id: string; name: string; columns: { id: string; name: string }[]; rows: { cells: Record<string, string | string[]>; hidden?: unknown }[] }[]
  streamItems?: AzureWorkItem[]
  patterns: NamingPattern[]
  // TVL-29: the completion date field of the Tools query (TVL-20), the validation date of the Azure DevOps sources' tools.
  completionField?: string
}
export const ToolValidationsContext = createContext<ToolValidationsEnv | null>(null)
export const useToolValidationsEnv = () => useContext(ToolValidationsContext)
