import { useEffect, useRef, useState } from 'react'
import { loadWindchillSettings, windchillServiceUrl } from './windchill'
import { buildWindchillQuery, loadWindchillViews, parseWindchillPage, windchillSearchUrl, saveWindchillViews, validateWindchillView, type WindchillView } from './windchillViews'
import type { WindchillSource } from './windchillSnapshots'
import { queryWindchillInBrowser } from './windchillBrowser'
import { bridgeKey, parseBridgeResults } from './windchillBridge'
import { parseWindchillExport } from './windchillExport'
import type { GitStorage } from './useGitStorage'
import type { PageProps } from './pages/types'

// Windchill views: their searches (this browser), fetching them (desktop app, the browser itself with its own Windchill
// sign-in, or a Windchill tab with the "Windchill → app" bookmark), and importing the results opened in the browser. Each result is stored with the app data and, with Git storage
// connected, saved to Git for the web app.
export function useWindchill(store: PageProps['store'], git: GitStorage) {
  const [views, setViews] = useState<WindchillView[]>(loadWindchillViews)
  const [status, setStatus] = useState<Record<string, { state: 'busy' | 'ok' | 'error'; message: string }>>({})
  const desktop = Boolean(window.windchill?.query)
  const sources = store.state.windchillSources ?? []

  function saveView(input: WindchillView) {
    const view = validateWindchillView(input)
    const next = [...views.filter((entry) => entry.id !== view.id), view]
    saveWindchillViews(next); setViews(next)
    return view
  }
  function removeView(id: string) {
    const next = views.filter((entry) => entry.id !== id)
    saveWindchillViews(next); setViews(next)
    store.update((draft) => { draft.windchillSources = (draft.windchillSources ?? []).filter((source) => source.viewId !== id); return draft })
  }
  function saveResults(view: WindchillView, query: string, rows: Record<string, unknown>[], message: string) {
    const source: WindchillSource = { viewId: view.id, name: view.name, fetchedAt: new Date().toISOString(), query, columns: view.columns, rows }
    store.update((draft) => { draft.windchillSources = [...(draft.windchillSources ?? []).filter((entry) => entry.viewId !== view.id), source]; return draft })
    setStatus((current) => ({ ...current, [view.id]: { state: 'ok', message } }))
    if (git.connected) void git.pushWindchill(view, source)
  }
  async function fetchView(id: string) {
    const view = views.find((entry) => entry.id === id)
    if (!view) return
    const settings = loadWindchillSettings()
    const fail = (message: string) => setStatus((current) => ({ ...current, [id]: { state: 'error', message } }))
    if (!settings.host) { fail('Set the Windchill host in Settings → Windchill first.'); return }
    let path: string
    try { path = buildWindchillQuery(view) } catch (error) { fail(error instanceof Error ? error.message : String(error)); return }
    setStatus((current) => ({ ...current, [id]: { state: 'busy', message: 'Searching Windchill…' } }))
    try {
      const { rows } = window.windchill?.query ? await window.windchill.query({ host: settings.host, servicePath: settings.servicePath, path }) : await queryWindchillInBrowser(windchillServiceUrl(settings), path)
      saveResults(view, path, rows, `${rows.length} result${rows.length === 1 ? '' : 's'} saved.`)
    } catch (error) { fail(error instanceof Error ? error.message : String(error)) }
  }
  // The search address to open in the browser; '' until the host is set and the view is valid.
  function searchUrl(id: string) {
    const view = views.find((entry) => entry.id === id), settings = loadWindchillSettings()
    if (!view || !settings.host) return ''
    try { return windchillSearchUrl(windchillServiceUrl(settings), view) } catch { return '' }
  }
  // Results saved or copied from the browser: replace the view's results, or add the next page to them.
  function importView(id: string, text: string, nextPage = false) {
    const view = views.find((entry) => entry.id === id)
    if (!view) return
    const settings = loadWindchillSettings()
    const fail = (message: string) => setStatus((current) => ({ ...current, [id]: { state: 'error', message } }))
    if (!settings.host) { fail('Set the Windchill host in Settings → Windchill first.'); return }
    let page: ReturnType<typeof parseWindchillPage>, query: string
    try { page = parseWindchillPage(text, windchillServiceUrl(settings)); query = buildWindchillQuery(view) } catch (error) { fail(error instanceof Error ? error.message : String(error)); return }
    const previous = sources.find((entry) => entry.viewId === id)
    const rows = nextPage && previous ? [...previous.rows, ...page.rows] : page.rows
    if (rows.length > 20000) { fail('More than 20,000 results. Narrow the filters.'); return }
    const source: WindchillSource = { viewId: view.id, name: view.name, fetchedAt: new Date().toISOString(), query, columns: view.columns, rows, ...(page.next ? { next: page.next } : {}) }
    store.update((draft) => { draft.windchillSources = [...(draft.windchillSources ?? []).filter((entry) => entry.viewId !== id), source]; return draft })
    const count = (value: number) => `${value} result${value === 1 ? '' : 's'}`
    setStatus((current) => ({ ...current, [id]: { state: 'ok', message: `${count(page.rows.length)} imported${nextPage ? `, ${count(rows.length)} in total` : ''}.${page.next ? ' Windchill has more: open the next page, save it and use Import next page.' : ''}` } }))
    if (git.connected) void git.pushWindchill(view, source)
  }
  // A Windchill export (CSV) under Release Details: a new export, or a newer file for an existing one. Throws when the
  // file is not an export; returns the export's id.
  function importExport(text: string, fileName: string, name: string, id?: string) {
    const { columns, rows } = parseWindchillExport(text)
    const existing = id ? views.find((entry) => entry.id === id) : undefined
    const title = name.trim() || existing?.name || fileName.replace(/\.[^.]+$/, '') || 'Windchill export'
    const view: WindchillView = { ...(existing ?? { id: crypto.randomUUID().replaceAll('-', ''), entitySet: '', filters: [], showInMenu: true }), name: title, columns, exportFile: fileName }
    const next = [...views.filter((entry) => entry.id !== view.id), view]
    saveWindchillViews(next); setViews(next)
    saveResults(view, `file:${fileName}`, rows, `${rows.length} result${rows.length === 1 ? '' : 's'} imported from ${fileName}.`)
    return view.id
  }
  // Fetch via a Windchill tab: opens the service in a tab this app can answer (no "noopener"); the bookmark there asks
  // for the searches and sends the results back. Only the Windchill origin, that tab and the request's code count.
  const pending = useRef<{ nonce: string; origin: string; service: string; tab: Window; views: { id: string; path: string }[]; timer: number } | null>(null)
  function fetchViaTab(ids: string[]) {
    const settings = loadWindchillSettings()
    const targets = views.filter((view) => ids.includes(view.id))
    const mark = (state: 'busy' | 'error', message: string) => setStatus((current) => Object.fromEntries([...Object.entries(current), ...targets.map((view) => [view.id, { state, message }])]))
    if (!settings.host) { mark('error', 'Set the Windchill host in Settings → Windchill first.'); return }
    const requested: { id: string; path: string }[] = []
    for (const view of targets) {
      try { requested.push({ id: view.id, path: buildWindchillQuery(view) }) } catch (error) { setStatus((current) => ({ ...current, [view.id]: { state: 'error', message: error instanceof Error ? error.message : String(error) } })) }
    }
    if (!requested.length) return
    const service = windchillServiceUrl(settings)
    const tab = window.open(service, 'dph-windchill')
    if (!tab) { mark('error', 'The browser blocked the Windchill tab; allow pop-ups for this app and try again.'); return }
    if (pending.current) window.clearTimeout(pending.current.timer)
    const timer = window.setTimeout(() => {
      if (pending.current?.timer !== timer) return
      pending.current = null
      setStatus((current) => Object.fromEntries(Object.entries(current).map(([id, entry]) => [id, requested.some((view) => view.id === id) && entry.state === 'busy' ? { state: 'error', message: 'No results came back from the Windchill tab. Click the “Windchill → app” bookmark there, or try again.' } : entry])))
    }, 10 * 60 * 1000)
    pending.current = { nonce: crypto.randomUUID(), origin: new URL(service).origin, service, tab, views: requested, timer }
    mark('busy', 'Waiting for the Windchill tab: click the “Windchill → app” bookmark there.')
  }
  useEffect(() => {
    function receive(event: MessageEvent) {
      const request = pending.current
      if (!request || event.origin !== request.origin || event.source !== request.tab) return
      const data = event.data as { app?: unknown; type?: unknown } | null
      if (data?.app !== bridgeKey) return
      if (data.type === 'ready') { request.tab.postMessage({ app: bridgeKey, type: 'request', nonce: request.nonce, service: request.service, views: request.views }, request.origin); return }
      const results = parseBridgeResults(event.data, request.nonce, request.views.map((view) => view.id))
      if (!results) return
      window.clearTimeout(request.timer)
      pending.current = null
      for (const result of results) {
        const view = views.find((entry) => entry.id === result.id), query = request.views.find((entry) => entry.id === result.id)?.path ?? ''
        if (!view) continue
        if ('error' in result) setStatus((current) => ({ ...current, [view.id]: { state: 'error', message: `Windchill tab: ${result.error}` } }))
        else saveResults(view, query, result.rows, `${result.rows.length} result${result.rows.length === 1 ? '' : 's'} from the Windchill tab.`)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  })
  return { views, sources, status, desktop, fetchViaTab, importExport, reload: () => setViews(loadWindchillViews()), saveView, removeView, fetchView, searchUrl, importView }
}
export type WindchillWorkspace = ReturnType<typeof useWindchill>
