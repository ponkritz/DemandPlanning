import { showsInMenu, viewNameOf, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import { defaultStreams, exportForStream, profileForStream } from './streams.ts'

// The Azure DevOps menu: every connection marked "Show in menu", named by its View name (else the connection name).
// The active Time Writing connection is the editable backlog; every other shown connection is a read-only view.
// Connections kept for backend purposes (Show in menu off) are fetched and used but not listed.
// onPrem: an on-prem server (Azure DevOps Server) connection; these views are listed under Release Details.
export interface BacklogView { id: string; name: string; readOnly: boolean; role: AzureConnectionProfileSummary['role']; onPrem: boolean }
type ViewProfile = Pick<AzureConnectionProfileSummary, 'id' | 'reason' | 'role' | 'viewName' | 'showInMenu' | 'query'> & { baseUrl?: string }

const activeTimeWriting = (profiles: ViewProfile[], activeId: string) => profiles.find((profile) => profile.id === activeId && profile.role === 'time-tracking') ?? profiles.find((profile) => profile.role === 'time-tracking')

// The Time Writing backlog, listed or not; pages that link to it use this name. Its default name is QMS-0025 (the
// team backlog); a View name on the connection overrides it.
export const defaultBacklogName = 'QMS-0025'
export function timeWritingView(profiles: ViewProfile[], activeId: string): BacklogView {
  const profile = activeTimeWriting(profiles, activeId)
  return { id: profile?.id ?? 'time-writing', name: profile?.viewName?.trim() || defaultBacklogName, readOnly: false, role: 'time-tracking', onPrem: Boolean(profile?.baseUrl) }
}

export function backlogViews(profiles: ViewProfile[], activeId: string): BacklogView[] {
  const timeWriting = activeTimeWriting(profiles, activeId)
  const streamIds = new Set(defaultStreams.map((stream) => profileForStream(stream, profiles as AzureConnectionProfileSummary[])?.id).filter(Boolean))
  return [
    // Without any Time Writing connection (sample data, first start) the backlog is still listed, as QMS-0025.
    ...(!timeWriting || showsInMenu(timeWriting) ? [timeWritingView(profiles, activeId)] : []),
    // A default stream's connection (DP, CP, …) is always listed: Release Details shows it whatever its Show in menu says.
    ...profiles.filter((profile) => profile.role !== 'time-tracking' && (showsInMenu(profile) || streamIds.has(profile.id))).map((profile) => ({ id: profile.id, name: viewNameOf(profile), readOnly: true, role: profile.role, onPrem: Boolean(profile.baseUrl) })),
  ]
}

const tabKey = 'demand-planning-backlog-tab-v1'
export function loadBacklogTab(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(tabKey) ?? '' } catch { return '' } }
export function saveBacklogTab(id: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(tabKey, id) } catch { /* kept for this session */ } }

// The menu's "Other views": every read-only view shown in the menu that is not one of the default Azure streams
// (DP, CP, IOCC, Content, Tool Validations, which sit under Release Details), from an on-prem server or the cloud, and
// every Windchill export shown in the menu that is not a default Windchill stream (S&S IT). Without this heading such
// views had no place in the menu. The Time Writing backlog stays under I&D Board.
type StreamProfile = Parameters<typeof profileForStream>[1][number]
export function otherMenuViews<W extends { id: string; name: string; exportFile?: string }>(views: BacklogView[], profiles: StreamProfile[], windchill: W[]) {
  const streamIds = new Set(defaultStreams.map((stream) => profileForStream(stream, profiles)?.id).filter(Boolean))
  const streamExports = new Set(defaultStreams.map((stream) => exportForStream(stream, windchill)?.id).filter(Boolean))
  return {
    azure: views.filter((view) => view.readOnly && !streamIds.has(view.id)),
    windchill: windchill.filter((view) => view.exportFile && !streamExports.has(view.id)),
  }
}
