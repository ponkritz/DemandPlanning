import { adminHealth, type AdminFacts, type HealthItem } from '../adminOverview'
import type { AuditEvent } from '../domain'
import { formatDateTime } from '../format'
import type { SetupStep } from '../setupGuide'
import type { SettingsTab } from '../settingsTabs'
import type { GitStorage } from '../useGitStorage'
import { GitSyncBar } from './GitStorage'
import { Notice, Panel, Pill } from './ui'

// ADM-01…02 Admin → Overview: setup health and the to-do list, unsaved shared changes with Save to Git (the publish
// tray), and the latest changes (SET-27: only for the holders of “Shared setup in Git”, who may open the Changes);
// every item links to the setting that fixes it.
const toneLabel: Record<HealthItem['tone'], string> = { todo: 'To do', warn: 'Attention', info: 'Optional', ok: 'OK' }
const pillTone: Record<HealthItem['tone'], 'danger' | 'warning' | 'info' | 'open'> = { todo: 'danger', warn: 'warning', info: 'info', ok: 'open' }
export function AdminOverview({ steps, facts, git, audits, showChanges, onOpenTab, onSearch }: { steps: SetupStep[]; facts: AdminFacts; git: GitStorage; audits: AuditEvent[]; showChanges: boolean; onOpenTab: (tab: SettingsTab, section?: string) => void; onSearch: () => void }) {
  const items = adminHealth(steps, facts)
  const open = items.filter((item) => item.tone !== 'info')
  return <>
    <Panel className="admin-section admin-overview" eyebrow="ADMIN" title="Setup health" action={<button type="button" className="ghost" onClick={onSearch}>Search settings… <kbd>Ctrl K</kbd></button>}>
      <p className={open.length ? 'warning-text' : 'muted'}>{open.length ? `${open.length} item${open.length === 1 ? '' : 's'} to look at.` : 'Nothing required is open.'}</p>
      <ul className="health-list">{items.map((item) => <li key={item.id} className={`health-${item.tone}`}>
        <Pill tone={pillTone[item.tone]}>{toneLabel[item.tone]}</Pill>
        <div><strong>{item.title}</strong><small>{item.detail}</small></div>
        {item.fix && <button type="button" className="ghost" onClick={() => onOpenTab(item.fix!.tab, item.fix!.section)}>{item.fix.label} →</button>}
      </li>)}{!items.length && <li className="health-ok"><Pill tone="open">OK</Pill><div><strong>Everything is set up.</strong></div></li>}</ul>
    </Panel>
    <Panel className="admin-section" eyebrow="PUBLISH" title="Unsaved shared changes">
      {facts.unsaved ? <><Notice tone="warning">Changes to the shared planning data made here are not yet in Git: others see them after Save to Git.</Notice><GitSyncBar git={git} /></>
        : <p className="muted">{git.connected ? 'Everything shared is saved in Git.' : 'Connect Git storage (Data & history) to share the setup.'}</p>}
    </Panel>
    {showChanges && <Panel className="admin-section" eyebrow="CHANGES" title="Latest changes" action={<button type="button" className="ghost" onClick={() => onOpenTab('storage', 'changes')}>All changes →</button>}>
      {audits.length ? <ul className="audit-mini">{audits.slice(0, 5).map((item) => <li key={item.id}><time>{formatDateTime(item.timestamp)}</time> <strong>{item.entity}</strong> {item.detail}</li>)}</ul> : <p className="muted">No changes recorded yet.</p>}
    </Panel>}
  </>
}
