import { useState } from 'react'
import { defaultGitPath, defaultGitRepository } from '../gitStorage'
import type { GitStorage } from '../useGitStorage'
import { Modal, Notice, Panel, Pill, SettingsSummary, type Tone } from './ui'

const tone: Record<GitStorage['status'], Tone> = { off: 'neutral', loading: 'info', synced: 'open', empty: 'warning', saving: 'info', error: 'danger', conflict: 'danger' }
const label: Record<GitStorage['status'], string> = { off: 'Not connected', loading: 'Loading', synced: 'Synced', empty: 'File not created', saving: 'Saving', error: 'Error', conflict: 'Conflict' }

// Settings: where the planning data file lives and the token that reads and writes it. The form starts with the team's
// data repository (defaultGitRepository), so a new user only pastes a token.
export function GitStoragePanel({ git }: { git: GitStorage }) {
  const [form, setForm] = useState({ ...defaultGitRepository, ...git.config })
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(true)
  const [open, setOpen] = useState(false)
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }) })
  // The connection is edited in a pop-up; the panel shows where the data lives and the actions on it.
  return <Panel className="connection-panel admin-section" eyebrow="PLANNING DATA" title="Git storage" info="Baseline rules, release scopes and the region / role mapping are saved as one JSON file in a private GitHub repository; every save is a commit. Use a separate private repository (not the app's), with a fine-grained token limited to it with Contents: Read and write. The token stays in this browser." action={<Pill tone={tone[git.status]}>{label[git.status]}</Pill>}>
    {git.config ? <SettingsSummary rows={[['Repository', `${git.config.owner}/${git.config.repo}`], ['Branch', git.config.branch], ['Data file', git.config.path], ['Token', git.connected ? git.readOnly ? 'Saved here · read only' : 'Saved here' : 'Not entered']]} /> : <p className="muted">Not connected: the shared setup (connections, Feature setup, holidays and activities, regions and roles) comes from a private GitHub repository your team uses.</p>}
    <div className="button-row"><button type="button" className={git.connected ? 'ghost' : 'primary'} onClick={() => setOpen(true)}>{git.connected ? 'Change connection…' : 'Connect Git storage…'}</button>{git.connected && <><button type="button" className="ghost" disabled={git.status === 'loading' || git.status === 'saving'} onClick={() => void git.load()}>Load latest</button><button type="button" className="ghost" onClick={git.disconnect}>Disconnect</button></>}</div>
    {open && <Modal title={git.connected ? 'Change Git storage' : 'Connect Git storage'} eyebrow="SETTINGS · STORAGE" wide form onClose={() => setOpen(false)}>
      <form className="connection-form" onSubmit={(event) => { event.preventDefault(); void git.connect(form, token, remember).then(() => { setToken(''); setOpen(false) }) }}>
        <label>Owner (user or organisation)<input required {...field('owner')} placeholder={defaultGitRepository.owner} /></label>
        <label>Repository<input required {...field('repo')} placeholder={defaultGitRepository.repo} /></label>
        <label>Branch<input {...field('branch')} placeholder="main" /></label>
        <label>Data file<input {...field('path')} placeholder={defaultGitPath} /></label>
        <label className="wide-field">GitHub token<input type="password" autoComplete="off" required={!git.connected} value={token} onChange={(event) => setToken(event.target.value)} placeholder={git.connected ? 'Saved in this browser — enter a new one to replace it' : 'github_pat_…'} /><small>Fine-grained token limited to this repository: Contents Read (to use the app) or Read and write (to save).</small></label>
        <label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember token in this browser</label>
        <div className="connection-actions"><button className="primary" disabled={git.status === 'loading' || git.status === 'saving'}>{git.connected ? 'Update & load' : 'Connect & load'}</button><button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      </form>
    </Modal>}
    {git.message && <Notice tone={git.status === 'error' || git.status === 'conflict' ? 'error' : git.status === 'empty' ? 'warning' : 'info'}>{git.message}{git.history && git.connected && <> · <a href={git.history} target="_blank" rel="noreferrer">History in GitHub</a></>}</Notice>}
  </Panel>
}

// Shown where planning data is edited: whether changes are only in this browser, unsaved, or committed.
export function GitSyncBar({ git, onOpenSettings }: { git: GitStorage; onOpenSettings?: () => void }) {
  const [commit, setCommit] = useState('')
  if (!git.connected) return <Notice tone="warning" className="git-bar">Baselines, the region / role mapping and the capacity settings (holidays and common activities included) are saved only in this browser until Git storage is connected.{onOpenSettings && <> <button type="button" className="text-button" onClick={onOpenSettings}>Set up Git storage →</button></>}</Notice>
  if (git.status === 'error' || git.status === 'conflict') return <Notice tone="error" className="git-bar">{git.message} <button type="button" className="text-button" onClick={() => void git.load()}>Load latest from Git</button></Notice>
  if (git.readOnly) return <Notice tone="info" className="git-bar">View only: your Git token can read but not save, so baselines, the mapping and the capacity settings are shown as in Git. Ask a People Manager (or anyone with write access) to change them.</Notice>
  if (git.isSample && (git.dirty || git.status === 'empty')) return <Notice tone="warning" className="git-bar">Synthetic sample data is loaded: changes stay in this browser and are not saved to Git.</Notice>
  if (git.dirty || git.status === 'empty') return <form className="git-bar git-bar-dirty" onSubmit={(event) => { event.preventDefault(); void git.save(commit).then(() => setCommit('')) }}>
    <span><strong>Unsaved changes</strong> — not yet in Git</span>
    <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (e.g. CP v3.1: 2 assets scoped in)" />
    <button className="primary" disabled={git.status === 'saving'}>{git.status === 'saving' ? 'Saving…' : 'Save to Git'}</button>
  </form>
  return <p className="git-bar git-bar-synced"><Pill tone={tone[git.status]}>{label[git.status]}</Pill> {git.status === 'loading' ? git.message : <>Saved in Git · <a href={git.history} target="_blank" rel="noreferrer">history</a></>}</p>
}
