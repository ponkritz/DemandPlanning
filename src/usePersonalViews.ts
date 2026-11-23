import { useCallback, useEffect, useRef, useState } from 'react'
import { GitConflictError } from './gitStorage'
import { emptyViews, parseViews, withDefaultEntry, personalViewsPath, serializeViews, viewsDefaultsPath, withDefaults, type MenuLayout, type PersonalViews, type SectionLayout } from './personalViews'
import type { GitStorage } from './useGitStorage'

// Each person's views (MYD-06…MYD-09): kept in this browser at once (so a change shows immediately and survives without
// Git), and in Git per person a moment after the last change, read back at start on any computer. The admin's
// defaults apply to every page a person has not changed.
const cacheKey = (email: string) => `demand-planning-views-v1:${email || 'local'}`
const read = (key: string) => { try { return parseViews(localStorage.getItem(key)) } catch { return emptyViews() } }
const write = (key: string, views: PersonalViews) => { try { localStorage.setItem(key, serializeViews(views)) } catch { /* Git keeps it */ } }

export function usePersonalViews(git: GitStorage, myEmail: string) {
  const email = personalViewsPath(myEmail) ? myEmail.trim().toLowerCase() : ''
  const [mine, setMine] = useState<PersonalViews>(() => read(cacheKey(email)))
  const [defaults, setDefaults] = useState<PersonalViews>(() => read(cacheKey('defaults')))
  const [note, setNote] = useState('')
  const sha = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(mine)
  const { connected, readOnly, readPersonalViews, readViewsDefaults } = git
  // GIT-18: newer views saved elsewhere are read again quietly (reload), unless a change here is still waiting to be saved.
  const [reads, setReads] = useState(0)
  useEffect(() => { setMine(read(cacheKey(email))); sha.current = null }, [email])
  useEffect(() => {
    if (!connected) return
    let active = true
    void (async () => {
      try {
        const shared = await readViewsDefaults()
        if (active && shared.text != null) { const parsed = parseViews(shared.text); setDefaults(parsed); write(cacheKey('defaults'), parsed) }
        if (!email) return
        const own = await readPersonalViews(email)
        if (!active) return
        sha.current = own.sha
        if (own.text != null) { const parsed = parseViews(own.text); setMine(parsed); latest.current = parsed; write(cacheKey(email), parsed) }
      } catch (failure) { if (active) setNote(`Your views were not read from Git: ${failure instanceof Error ? failure.message : String(failure)}`) }
    })()
    return () => { active = false }
  }, [connected, email, readPersonalViews, readViewsDefaults, reads])

  const pushToGit = useCallback(async () => {
    if (!connected || readOnly || !email) return
    const text = serializeViews(latest.current)
    try {
      const saved = await git.writePersonalViews(email, text, sha.current, `My views (${email})`)
      sha.current = saved.sha; setNote('')
    } catch (failure) {
      if (failure instanceof GitConflictError) { try { const fresh = await git.readPersonalViews(email); sha.current = fresh.sha; const saved = await git.writePersonalViews(email, text, sha.current, `My views (${email})`); sha.current = saved.sha; setNote(''); return } catch { /* reported below */ } }
      setNote(`Your views are kept in this browser; saving them to Git failed: ${failure instanceof Error ? failure.message : String(failure)}`)
    }
  }, [connected, readOnly, email, git])
  const change = (edit: (views: PersonalViews) => PersonalViews) => {
    const next = edit(latest.current)
    latest.current = next; setMine(next); write(cacheKey(email), next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; void pushToGit() }, 1500)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const views = withDefaults(mine, defaults)
  return {
    views, note, inGit: Boolean(connected && !readOnly && email),
    reload: () => { if (!timer.current) setReads((count) => count + 1) },
    sections: (page: string): SectionLayout | undefined => views.sections[page],
    setSections: (page: string, layout: SectionLayout) => change((current) => ({ ...current, sections: { ...current.sections, [page]: layout } })),
    resetSections: (page: string) => change((current) => { const sections = { ...current.sections }; delete sections[page]; return { ...current, sections } }),
    menu: views.menu,
    setMenu: (menu: MenuLayout) => change((current) => ({ ...current, menu })),
    filter: <T,>(page: string, check: (value: unknown) => T | undefined): T | undefined => check(views.filters[page]),
    setFilter: (page: string, value: unknown) => change((current) => ({ ...current, filters: { ...current.filters, [page]: value } })),
    // BKL-47: one entry (e.g. the QMS-0025 column order) as everyone's default; the defaults file is read fresh first so
    // the other defaults in it are kept.
    saveEntryAsDefault: async (page: string, value: unknown) => {
      const fresh = await readViewsDefaults()
      const current = fresh.text != null ? parseViews(fresh.text) : defaults
      const text = serializeViews(withDefaultEntry(current, page, value))
      const saved = await git.writeViewsDefaults(text, `Default ${page} from ${email || 'a Tool Owner'}`)
      const parsed = parseViews(saved.text)
      setDefaults(parsed); write(cacheKey('defaults'), parsed)
      return saved
    },
    // Admins: my sections and menu become everyone's default (filters stay personal). GIT-17: queued and merged with a
    // default saved by someone else in between (per page; the later save wins for a page both changed).
    saveAsDefault: async () => {
      const text = serializeViews({ ...emptyViews(), sections: views.sections, menu: views.menu })
      const saved = await git.writeViewsDefaults(text, `Default views from ${email || 'an admin'}`)
      const parsed = parseViews(saved.text)
      setDefaults(parsed); write(cacheKey('defaults'), parsed)
      return saved
    },
    defaultsQueue: git.queueState(viewsDefaultsPath),
    retryDefaults: () => git.retryQueued(viewsDefaultsPath),
  }
}
export type PersonalViewsStore = ReturnType<typeof usePersonalViews>
