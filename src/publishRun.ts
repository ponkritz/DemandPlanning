import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { canManagePages, isEmail, parseAccess, rightsFor } from './access'
import { recordJob, runInBackground } from './backgroundJobs'
import { utcToday } from './businessTime'
import { pairFactory, resolveChartSize, sizeFromOptions } from './chartSize'
import { chartCurrency, emptyChoice, insightsLocalKey, insightsViewerKey, narrowInsightRows, readChoice, resolveFilterSetup, scopeText, type ViewerChoice } from './insightFilters'
import { hasTable, withoutHidden, type Insight, type OnDemandPage } from './onDemand'
import { emptyLayout, kindOf, pageRights, parseMenuLayout, type MenuLayout } from './menuLayout'
import { exportStamp } from './printExport'
import { isDue, parsePublishKey, parseSchedules, publishKey, scheduleKey, type PublishSchedule } from './publishSchedule'
import { downloadHtml, targetKind, writeTarget } from './publishTarget'
import { buildStandaloneHtml, publishTable, scriptHash } from './standaloneHtml'
import type { OnDemandStore } from './useOnDemand'
import type { Access } from './useAccess'
import type { GitStorage } from './useGitStorage'
import type { MenuLayoutStore } from './useMenuLayout'
import type { PersonalViewsStore } from './usePersonalViews'

// OND-73…OND-80 Publishing a page's standalone HTML file — now (from the page ⋯) or on its schedule (while the app is
// open, this hook in the app shell) — with the publisher's name, the Insights charts with the publisher's filter row
// (the choice remembered for them, OND-55) at the sizes the owners set, and every row that is not hidden.

export const isCardInsight = (insight: Insight) => insight.type === 'kpi' && insight.options?.view !== 'panel'
// OND-55: the publisher's filter row choice for the page — their personal views, else this browser.
export function viewerChoice(pageId: string, views?: PersonalViewsStore): ViewerChoice {
  const stored = views?.filter(insightsViewerKey(pageId), (value) => value)
  if (stored && typeof stored === 'object') return readChoice(stored)
  try { return readChoice(JSON.parse(localStorage.getItem(insightsLocalKey(pageId)) ?? 'null')) } catch { return emptyChoice() }
}
export const sampleRefusal = (name: string) => `Sample data is shown for ${name}: switch to Live to publish.`

interface PublisherState { git: GitStorage; store: OnDemandStore; access: Access; menu: MenuLayoutStore; viewingAs: boolean }
const editorOnly = (name: string) => `Only the Tool Owner and the co-owners of ${name} publish it as a standalone HTML file.`
function permissionReason(policy: Access['policy'], email: string, layout: MenuLayout, id: string, name: string) {
  if (!policy) return 'Load the current access roles from Git before publishing.'
  const rights = rightsFor(policy, email)
  const viewer = { email, can: (action: Parameters<Access['can']>[0]) => rights.actions.has(action), readOnly: false, manager: canManagePages(policy, rights) }
  if (!hasTable(kindOf(layout, id))) return 'Only a table page can be published.'
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
  if (git.isSample || store.isSample(id) || page?.sample) return `Switch ${page?.name ?? 'this page'} to Live to publish: sample rows are never published.`
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
    return { page, kind }
  }
  return { repository: current.git.accessScope, publisher: current.access.email, ready: readyToPublish(current), reason: (id: string) => publishReason(current, id), check, verify, load }
}
export type PublishAuthorization = ReturnType<typeof usePublishAuthorization>

// The file's text. page: the page as the store gives it (in Sample it is refused); charts only on a Table + Insights page.
export async function buildPageHtml(page: OnDemandPage, { publishedBy, choice, kind, now = new Date() }: { publishedBy: string; choice: ViewerChoice; kind: string; now?: Date }) {
  if (page.sample) throw new Error(sampleRefusal(page.name))
  const visible = withoutHidden(page)
  const charts = kind === 'table-insights' && visible.insights.length ? visible.insights : []
  const setup = resolveFilterSetup(visible)
  const narrowed = narrowInsightRows(visible, setup, choice, Number(utcToday(now).slice(0, 4)))
  // The chart drawing loads with the first publish (it is not part of the app shell).
  const { captureCharts } = await import('./chartCapture')
  const captured = await captureCharts(narrowed.page, charts.map((insight) => ({ insight, card: isCardInsight(insight), size: resolveChartSize({ owner: sizeFromOptions(insight.options), factory: pairFactory }).size, currency: narrowed.active ? chartCurrency(insight, narrowed) : '' })), page.colors)
  const filtersLine = !charts.length ? '' : narrowed.active ? `filter row — ${scopeText(setup, choice, narrowed, Number(utcToday(now).slice(0, 4)))}` : `every row of ${page.name} (no filter row)`
  return buildStandaloneHtml({ pageName: page.name, description: page.description, publishedBy, publishedAt: exportStamp(now), filtersLine, charts: captured, table: publishTable(page) }, await scriptHash())
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

// OND-75, OND-76: one publish of a page as a Background job; interactive — from the person's click (the browser may ask
// for its write permission once per session; without the File System Access API the file is downloaded instead).
export function runPublish({ key, id, name, publishedBy, choice, authorization, scheduledAt }: { key: string; id: string; name: string; publishedBy: string; choice: ViewerChoice; authorization: PublishAuthorization; scheduledAt?: string }) {
  return runInBackground(`publish:${key}`, `${scheduledAt ? 'Scheduled publish' : 'Publish HTML'} · ${name}`, async (progress) => {
    const finish = (ok: boolean, text: string) => { if (scheduledAt) writeSchedule(key, (current) => current?.lastRun === scheduledAt ? { ...current, lastOk: ok, lastText: text } : current) }
    const check = () => {
      authorization.check(key, id)
      if (scheduledAt && readSchedules()[key]?.lastRun !== scheduledAt) throw new Error('The publish schedule changed. Nothing was written.')
    }
    try {
      check()
      progress('Reading the live page from Git…')
      const { page, kind } = await authorization.load(key, id)
      check()
      progress('Drawing the charts…')
      const html = await buildPageHtml(page, { publishedBy, choice, kind })
      const rows = withoutHidden(page).rows.length
      const authorize = async () => {
        check()
        if (await authorization.verify(key, id) !== kind) throw new Error('The page type changed while publishing. Nothing was written.')
      }
      if (targetKind() === 'download') {
        if (scheduledAt) throw new Error('This browser cannot write to a chosen file, so a scheduled publish cannot run here. Use the desktop app, or Chrome or Edge.')
        await authorize()
        check()
        const name = downloadHtml(html, page.name)
        const text = `This browser cannot write to a chosen file (or it is blocked): downloaded ${name} (${rows} rows) instead — move it where it belongs.`
        finish(true, text); return { text }
      }
      progress('Writing the file…')
      const done = await writeTarget(key, html, { authorize, check })
      const text = `Published ${rows} row${rows === 1 ? '' : 's'} of ${page.name} to ${done.where} (${Math.max(1, Math.round(done.bytes / 1024))} KB).`
      finish(true, text); return { text }
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : String(failure)
      finish(false, text)
      throw failure
    }
  })
}

// OND-78, OND-79: the scheduler — at the start and every minute while the app is open, each due page of this computer
// is published (a run missed while the app was closed runs now, once). allowed(id): the person may still publish it.
export function usePublishScheduler({ store, views, publishedBy, authorization }: { store: OnDemandStore; views?: PersonalViewsStore; publishedBy: string; authorization: PublishAuthorization }) {
  const latest = useRef({ store, views, publishedBy, authorization })
  useLayoutEffect(() => { latest.current = { store, views, publishedBy, authorization } })
  const { ready, repository, publisher } = authorization
  useEffect(() => {
    if (!ready) return
    const tick = () => {
      const { store: current, views: personal, publishedBy: name, authorization: active } = latest.current
      if (!active.ready) return
      const now = new Date()
      for (const [key, schedule] of Object.entries(readSchedules())) {
        const scope = parsePublishKey(key)
        if (!scope || scope.repository !== active.repository || scope.publisher !== active.publisher) continue
        if (!isDue(schedule, now)) continue
        const id = scope.pageId
        const page = current.full(id)
        const scheduledAt = now.toISOString()
        writeSchedule(key, (entry) => entry && { ...entry, lastRun: scheduledAt })
        const why = active.reason(id)
        if (why || !page) {
          writeSchedule(key, (entry) => entry && { ...entry, lastOk: false, lastText: why })
          recordJob(`publish:${key}`, `Scheduled publish · ${page?.name ?? id}`, { text: why, failed: true })
          continue
        }
        runPublish({ key, id, name: page.name, publishedBy: name, choice: viewerChoice(id, personal), authorization: active, scheduledAt })
      }
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [ready, repository, publisher])
}
