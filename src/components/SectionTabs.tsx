import { useState, type ReactNode } from 'react'
import { ScopeChip, type Scope } from './ScopeChip'
import { pickSection, rememberedSection, saveSettingsSection, type SettingsTab } from '../settingsTabs'

// A Settings page's sections, one at a time (SET-14): a row of section buttons and the chosen section. A page with one
// section shows it without the row. The section shown last on each page is remembered in this browser (a remembered
// section that has moved opens where it lives now, SET-28). remember={false}: not remembered (a page's ⚙ settings
// pop-up, SET-32, opens on its first tab and leaves the Admin pages' choice alone); label: the tab list's name.
export type Section = { key: string; label: string; node: ReactNode; scope?: Scope }
export function SectionTabs({ page, sections, chosen, onChoose, remember = true, label = 'Sections' }: { page: SettingsTab; sections: Section[]; chosen?: string; onChoose?: (key: string) => void; remember?: boolean; label?: string }) {
  const [own, setOwn] = useState(() => remember ? rememberedSection(page) : undefined)
  const current = pickSection(sections.map((section) => section.key), chosen ?? own)
  const choose = (key: string) => { setOwn(key); if (remember) saveSettingsSection(page, key); onChoose?.(key) }
  const shown = sections.find((section) => section.key === current)
  return <>
    {sections.length > 1 && <div className="overview-tabs settings-sections" role="tablist" aria-label={label}>{sections.map((section) => <button key={section.key} type="button" role="tab" aria-selected={section.key === current} className={`backlog-tab${section.key === current ? ' active' : ''}`} onClick={() => choose(section.key)}>{section.label}</button>)}</div>}
    {shown?.scope && <div className="scope-line"><ScopeChip scope={shown.scope} /></div>}
    {shown?.node}
  </>
}
