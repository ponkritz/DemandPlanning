import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { canManagePages, isEmail, parseAccess, rightsFor } from './access'
import { recordJob, runInBackground } from './backgroundJobs'
import { pageOfSource, parseDashboard, type Dashboard } from './dashboardPages'
import { emptyLayout, kindOf, pageRights, parseMenuLayout, type MenuLayout } from './menuLayout'
import { emptyChoice, insightsLocalKey, insightsViewerKey, readChoice, type ViewerChoice } from './insightFilters'
import { hasTable, type OnDemandPage } from './onDemand'
import { exportStamp } from './printExport'
import { cutDashboard, cutSummary, cutTablePage, sampleRefusal, type PublishCut, type PublishedFile } from './publishData'
import { isDue, parsePublishKey, parseSchedules, publishKey, scheduleKey, type PublishSchedule } from './publishSchedule'
import { downloadHtml, targetKind, writeTarget } from './publishTarget'
import { buildStandaloneHtml } from './standaloneHtml'
import type { Access } from './useAccess'
import type { GitStorage } from './useGitStorage'
import type { MenuLayoutStore } from './useMenuLayout'
import type { OnDemandStore } from './useOnDemand'
import type { PersonalViewsStore } from './usePersonalViews'

// OND-90…OND-99 Publishing a page as an interactive HTML file — now (from the page ⋯) or on its schedule (while the app
// is open, this hook in the app shell): a table page (Table, Table + Insights) or an On-Demand Dashboard, with only the
// rows that pass the publisher's filters (Publish now: the filters on screen; a schedule: the filters saved with it,
// OND-96), the publisher's name and the viewer built with the app (OND-98).

export { sampleRefusal }
// OND-55: the publisher's Insights filter row choice for a table page — their personal views, else this browser.
export function viewerChoice(pageId: string, views?: PersonalViewsStore): ViewerChoice {
  const stored = views?.filter(insightsViewerKey(pageId), (value) => value)
  if (stored && typeof stored === 'object') return readChoice(stored)
  try { return readChoice(JSON.parse(localStorage.getItem(insightsLocalKey(pageId)) ?? 'null')) } catch { return emptyChoice() }
}
interface PublisherState { git: GitStorage; store: OnDemandStore; access: Access; menu: MenuLayoutStore; viewingAs: boolean }
const editorOnly = (name: string) => `Only the Tool Owner and the co-owners of ${name} publish it as an interactive HTML file.`
function permissionReason(policy: Access['policy'], email: string, layout: MenuLayout, id: string, name: string) {
  if (!policy) return 'Load the current access roles from Git before publishing.'
  const rights = rightsFor(policy, email)
  const viewer = { email, can: (action: Parameters<Access['can']>[0]) => rights.actions.has(action), readOnly: false, manager: canManagePages(policy, rights) }
  const kind = kindOf(layout, id)
  if (!hasTable(kind) && kind !== 'dashboard') return 'Only a table page or dashboard can be published.'
  return rights.areas.has('ondemand') && (viewer.manager || pageRights(viewer, layout, id).owner) ? '' : editorOnly(name)
}

function readyToPublish({ git, store, access, menu, viewingAs }: PublisherState) {
  return !viewingAs && !git.isSample && git.connected && Boolean(git.accessScope) && isEmail(access.email) &&
    access.loaded && !access.error && Boolean(access.policy) && menu.loaded && !menu.error && store.loaded && !store.errors.length
}

function publishReason(current: PublisherState, id: string) {
  const { git, store, access, menu, viewingAs } = current
  const page = store.full(id)
  if (viewingAs) return 'Exit View as before publishing.'
  if (git.isSample || (kindOf(menu.layout, id) !== 'dashboard' && (store.isSample(id) || page?.sample))) return `Switch ${page?.name ?? 'this page'} to Live to publish: sample rows are never published.`
  if (!git.connected) return 'Connect Git storage before publishing.'
  if (!publishKey(git.accessScope, access.email, id)) return 'Set your work email before publishing.'
  if (!readyToPublish(current)) return 'Load the current page, menu and access roles successfully from Git before publishing.'
  if (!page || !store.inGit(id)) return 'This page is not saved in the current Git repository.'
  return permissionReason(access.policy, access.email, menu.layout, id, page.name)
}

export function usePublishAuthorization(current: PublisherState) {
  const latest = useRef(current)
  useLayoutEffect(() => { latest.current = current })
  const check = (key: string, id: string) => {
    const active = latest.current
    if (publishKey(active.git.accessScope, active.access.email, id) !== key) throw new Error('The publishing repository or person changed. Start the publish again.')
    const why = publishReason(active, id)
    if (why) throw new Error(why)
    return active
  }
  async function verify(key: string, id: string) {
    const { git } = check(key, id)
    const [roles, placement] = await Promise.all([git.readAccess(), git.readMenuLayout()])
    const active = check(key, id)
    if (active.git.readAccess !== git.readAccess) throw new Error('The Git storage connection changed. Start the publish again.')
    const layout = placement.text == null ? emptyLayout() : parseMenuLayout(placement.text)
    const why = permissionReason(roles.text == null ? null : parseAccess(roles.text), active.access.email, layout, id, active.store.full(id)?.name ?? id)
    if (why) throw new Error(why)
    return kindOf(layout, id)
  }
  async function load(key: string, id: string) {
    const kind = await verify(key, id)
    const active = check(key, id)
    const page = await active.store.reloadPage(id)
    if (check(key, id).git.readAccess !== active.git.readAccess) throw new Error('The Git storage connection changed. Start the publish again.')
    if (!page || page.id !== id || page.sample) throw new Error('The live page could not be read from the current Git repository.')
    if (kind !== 'dashboard') return { page, kind, sources: new Map<string, OnDemandPage>() }
    const read = await active.git.readDashboard(id)
    if (read.text == null) throw new Error('The dashboard could not be read from Git.')
    const dashboard = parseDashboard(read.text, id).dashboard
    const sources = new Map<string, OnDemandPage>()
    for (const source of new Set(dashboard.blocks.map((block) => pageOfSource(block.source)).filter(Boolean))) {
      const latest = check(key, id)
      if (latest.git.readAccess !== active.git.readAccess) throw new Error('The Git storage connection changed. Start the publish again.')
      if (latest.store.isSample(source)) throw new Error(sampleRefusal(latest.store.full(source)?.name ?? source))
      const table = await latest.store.reloadPage(source)
      if (table) sources.set(source, table)
    }
    if (check(key, id).git.readAccess !== active.git.readAccess) throw new Error('The Git storage connection changed. Start the publish again.')
    return { page, kind, dashboard, sources }
  }
  return { repository: current.git.accessScope, publisher: current.access.email, ready: readyToPublish(current), reason: (id: string) => publishReason(current, id), check, verify, load }
}
export type PublishAuthorization = ReturnType<typeof usePublishAuthorization>

// What a publish needs to cut its data at the moment it runs (throws with the reason when it cannot, e.g. Sample).
export type Prepare = (now: Date, scheduled: boolean) => PublishedFile
export function prepareTable(page: OnDemandPage, kind: string, cut: PublishCut | undefined, publishedBy: string): Prepare {
  return (now, scheduled) => cutTablePage(page, { kind, choice: cut?.kind === 'table' ? cut.choice : emptyChoice(), publishedBy, now, at: exportStamp(now), scheduled, previouslyFullTable: scheduled && !cut })
}
export function prepareDashboard(page: Pick<OnDemandPage, 'name' | 'description'>, dashboard: Dashboard, pageOf: (id: string) => OnDemandPage | null, cut: PublishCut, publishedBy: string): Prepare {
  const { period, choices } = cut.kind === 'dashboard' ? cut : { period: { years: [], quarters: [], months: [] }, choices: {} }
  return (now, scheduled) => cutDashboard({ name: page.name, description: page.description, dashboard, pageOf, period, choices, publishedBy, now, at: exportStamp(now), scheduled })
}

// The file's text: the data and the viewer (loaded with the first publish; it is not part of the app shell).
export async function buildPageHtml(data: PublishedFile) {
  const { viewerJs, viewerCss } = await import('virtual:standalone-viewer')
  return buildStandaloneHtml(data, { js: viewerJs, css: viewerCss })
}

// ---- the schedules of this computer (localStorage), shared by the pages and the scheduler ----
const listeners = new Set<() => void>()
let snapshot: Record<string, PublishSchedule> | null = null
export function readSchedules(): Record<string, PublishSchedule> {
  if (!snapshot) { try { snapshot = parseSchedules(localStorage.getItem(scheduleKey)) } catch { snapshot = {} } }
  return snapshot
}
export function writeSchedule(key: string, change: (current: PublishSchedule | undefined) => PublishSchedule | undefined) {
  if (!parsePublishKey(key)) return
  const next = { ...readSchedules() }
  const value = change(next[key])
  if (value) next[key] = value; else delete next[key]
  snapshot = next
  try { localStorage.setItem(scheduleKey, JSON.stringify(next)) } catch { /* this visit only */ }
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useSchedules = () => useSyncExternalStore(subscribe, readSchedules, readSchedules)

export function runPublish({ key, id, name, publishedBy, cut, authorization, preview, scheduledAt, cutText }: {
  key: string; id: string; name: string; publishedBy: string; cut?: PublishCut; authorization: PublishAuthorization
  preview?: PublishedFile; scheduledAt?: string; cutText?: string
}) {
  return runInBackground(`publish:${key}`, `${scheduledAt ? 'Scheduled publish' : 'Publish HTML'} · ${name}`, async (progress) => {
    const finish = (ok: boolean, text: string) => {
      if (scheduledAt) writeSchedule(key, (current) => current?.lastRun === scheduledAt ? { ...current, lastOk: ok, lastText: text } : current)
    }
    const check = () => {
      const active = authorization.check(key, id)
      if (scheduledAt && readSchedules()[key]?.lastRun !== scheduledAt) throw new Error('The publish schedule changed. Nothing was written.')
      return active
    }
    try {
      check()
      progress('Reading the page and its data from Git…')
      const { page, kind, dashboard, sources } = await authorization.load(key, id)
      const checkSources = () => {
        const { store } = check()
        for (const [source, table] of sources) if (store.isSample(source)) throw new Error(sampleRefusal(table.name))
      }
      checkSources()
      if (cut ? (kind === 'dashboard') !== (cut.kind === 'dashboard') : !scheduledAt || kind === 'dashboard') {
        throw new Error('Review the filters and save the schedule again before publishing.')
      }
      progress('Applying the filters and building the file…')
      const prepare = dashboard && cut ? prepareDashboard(page, dashboard, (source) => sources.get(source) ?? null, cut, publishedBy)
        : prepareTable(page, kind, cut, publishedBy)
      const data = prepare(new Date(), Boolean(scheduledAt))
      const filters = cutSummary(data)
      // Reconfirm changed data instead of widening the set of rows the person agreed to export.
      if (preview && (cutSummary(preview) !== filters || JSON.stringify(preview.sources) !== JSON.stringify(data.sources))) {
        throw new Error('The live data or filters changed. Open Publish interactive HTML again to review the new data.')
      }
      if (scheduledAt && cutText && cutText !== filters) throw new Error('The filters no longer match the saved schedule. Review them and save the schedule again.')
      const html = await buildPageHtml(data)
      const rows = `${data.meta.rows} row${data.meta.rows === 1 ? '' : 's'}`
      const authorize = async () => {
        checkSources()
        if (await authorization.verify(key, id) !== kind) throw new Error('The page type changed while publishing. Nothing was written.')
      }
      if (targetKind() === 'download') {
        if (scheduledAt) throw new Error('This browser cannot write to a chosen file, so a scheduled publish cannot run here. Use the desktop app, or Chrome or Edge.')
        await authorize()
        checkSources()
        const file = downloadHtml(html, name)
        const text = `This browser cannot write to a chosen file (or it is blocked): downloaded ${file} (${rows}; ${filters}) instead — move it where it belongs.`
        finish(true, text)
        return { text }
      }
      progress('Writing the file…')
      const done = await writeTarget(key, html, { authorize, check: checkSources })
      const text = `Published ${rows} of ${name} (${filters}) to ${done.where} (${Math.max(1, Math.round(done.bytes / 1024))} KB).`
      finish(true, text)
      return { text }
    } catch (failure) {
      finish(false, failure instanceof Error ? failure.message : String(failure))
      throw failure
    }
  })
}

// A missed run resumes only for its original repository and publisher. A scoped table schedule saved before filters
// keeps the previously confirmed full table. A malformed filter selection is refused.
export function usePublishScheduler({ store, publishedBy, authorization }: { store: OnDemandStore; views?: PersonalViewsStore; publishedBy: string; authorization: PublishAuthorization }) {
  const latest = useRef({ store, publishedBy, authorization })
  useLayoutEffect(() => { latest.current = { store, publishedBy, authorization } })
  const { ready, repository, publisher } = authorization
  useEffect(() => {
    if (!ready) return
    const tick = () => {
      const { store: current, publishedBy: name, authorization: active } = latest.current
      if (!active.ready) return
      const now = new Date()
      for (const [key, schedule] of Object.entries(readSchedules())) {
        const scope = parsePublishKey(key)
        if (!scope || scope.repository !== active.repository || scope.publisher !== active.publisher || !isDue(schedule, now)) continue
        const id = scope.pageId, page = current.full(id), scheduledAt = now.toISOString()
        writeSchedule(key, (entry) => entry && { ...entry, lastRun: scheduledAt })
        const why = active.reason(id) || (schedule.invalidCut ? 'Review the filters and save the schedule again before publishing.' : '')
        if (why || !page) {
          writeSchedule(key, (entry) => entry && { ...entry, lastOk: false, lastText: why })
          recordJob(`publish:${key}`, `Scheduled publish · ${page?.name ?? id}`, { text: why, failed: true })
          continue
        }
        runPublish({ key, id, name: page.name, publishedBy: name, cut: schedule.cut, cutText: schedule.cutText, authorization: active, scheduledAt })
      }
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [ready, repository, publisher])
}
