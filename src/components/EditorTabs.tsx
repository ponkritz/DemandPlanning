import type { KeyboardEvent } from 'react'
import { panelId, tabId } from '../chartEditor'

// CHT-70…CHT-72 The tabs of a pop-up's form (the chart editor's Data, Filters, Format, Elements, Narrative): the look of
// the page tabs (UI-STANDARDS §7), role="tablist" with one tab in the Tab order — the arrow keys, Home and End move
// between the tabs and open the one reached. A tab shows the number of its settings changed from the defaults, "(2)",
// and, when one of its fields is invalid, a red marker whose reason is its tooltip and is read out with its name. On a
// phone the row scrolls sideways.
export type EditorTabItem<K extends string> = { key: K; label: string; count?: number; error?: string }

export function EditorTabs<K extends string>({ id, label, tabs, current, onChoose }: { id: string; label: string; tabs: EditorTabItem<K>[]; current: K; onChoose: (key: K) => void }) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const last = tabs.length - 1
    const to = event.key === 'ArrowRight' ? (at === last ? 0 : at + 1) : event.key === 'ArrowLeft' ? (at === 0 ? last : at - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1
    if (to < 0) return
    event.preventDefault()
    onChoose(tabs[to].key)
    document.getElementById(tabId(id, tabs[to].key))?.focus()
  }
  return <div className="overview-tabs editor-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, at) => {
      const active = tab.key === current
      return <button key={tab.key} id={tabId(id, tab.key)} type="button" role="tab" aria-selected={active} aria-controls={panelId(id, tab.key)} tabIndex={active ? 0 : -1}
        className={`backlog-tab ${active ? 'backlog-tab-active' : ''}${tab.error ? ' editor-tab-invalid' : ''}`} title={tab.error || undefined}
        onClick={() => onChoose(tab.key)} onKeyDown={(event) => move(event, at)}>
        {tab.label}{tab.count ? <span className="editor-tab-count"> ({tab.count})</span> : null}
        {tab.error ? <><span className="editor-tab-error" aria-hidden="true">!</span><span className="sr-only">: {tab.error}</span></> : null}
      </button>
    })}
  </div>
}
