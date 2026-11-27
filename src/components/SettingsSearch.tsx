import { useState } from 'react'
import { searchSettings, type SettingsEntry } from '../adminOverview'
import type { SettingsTab } from '../settingsTabs'
import { Modal } from './ui'

// ADM-03 Search settings (Ctrl K / ⌘ K): any settings page or section by name or by what it affects; Enter opens the first.
// AR-080: one row per setting, keyed by its page and name (never two rows with one key).
export function SettingsSearch({ allowed, onOpen, onClose }: { allowed: (entry: SettingsEntry) => boolean; onOpen: (tab: SettingsTab, section?: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const found = searchSettings(query).filter(allowed)
  const open = (entry: SettingsEntry) => { onOpen(entry.tab, entry.section); onClose() }
  return <Modal title="Search settings" eyebrow="SETTINGS" form={false} onClose={onClose}>
    <input className="search settings-search-input" aria-label="Search settings" autoFocus placeholder="e.g. PAT, IOCC, capacity, DoD" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && found[0]) { event.preventDefault(); open(found[0]) } }} />
    <ul className="settings-search-results" role="listbox" aria-label="Settings found">{found.map((entry) => <li key={`${entry.page}:${entry.label}`}><button type="button" role="option" aria-selected="false" onClick={() => open(entry)}><strong>{entry.label}</strong><small>{entry.page}</small></button></li>)}</ul>
    {!found.length && <p className="muted">No setting matches “{query}”.</p>}
  </Modal>
}
