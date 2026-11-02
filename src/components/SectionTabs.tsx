import { useState, type ReactNode } from 'react'
import { pickSection, readSettingsSections, saveSettingsSection, type SettingsTab } from '../settingsTabs'

// A Settings page's sections, one at a time (SET-14): a row of section buttons and the chosen section. A page with one
// section shows it without the row. The section shown last on each page is remembered in this browser.
export type Section = { key: string; label: string; node: ReactNode }
export function SectionTabs({ page, sections, chosen, onChoose }: { page: SettingsTab; sections: Section[]; chosen?: string; onChoose?: (key: string) => void }) {
  const [own, setOwn] = useState(() => readSettingsSections()[page])
  const current = pickSection(sections.map((section) => section.key), chosen ?? own)
  const choose = (key: string) => { setOwn(key); saveSettingsSection(page, key); onChoose?.(key) }
  const shown = sections.find((section) => section.key === current)
  return <>
    {sections.length > 1 && <div className="overview-tabs settings-sections" role="tablist" aria-label="Sections">{sections.map((section) => <button key={section.key} type="button" role="tab" aria-selected={section.key === current} className={`backlog-tab${section.key === current ? ' active' : ''}`} onClick={() => choose(section.key)}>{section.label}</button>)}</div>}
    {shown?.node}
  </>
}
