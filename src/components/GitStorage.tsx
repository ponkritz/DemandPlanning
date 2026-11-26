import { useState } from 'react'
import { confirmReplace, defaultGitPath, defaultGitRepository } from '../gitStorage'
import type { GitStorage } from '../useGitStorage'
import { Modal, Notice, Panel, Pill, SettingsSummary, type Tone } from './ui'

const tone: Record<GitStorage['status'], Tone> = { off: 'neutral', loading: 'info', synced: 'open', empty: 'warning', saving: 'info', error: 'danger', conflict: 'danger' }
const label: Record<GitStorage['status'], string> = { off: 'Not connected', loading: 'Loading', synced: 'Synced', empty: 'File not created', saving: 'Saving', error: 'Error', conflict: 'Conflict' }

// Settings: where the planning data file lives and the token that reads and writes it. The form starts with the team's
// data repository (defaultGitRepository), so a new user only pastes a token.
// GIT-13: the form is filled again each time it opens, from the connection in use then (it changes after the panel
// was shown, e.g. by Switch, GIT-24), so it never offers an earlier repository.
export function GitStoragePanel({ git }: { git: GitStorage }) {
  const [open, setOpen] = useState(false)
  // The connection is edited in a pop-up; the panel shows where the data lives and the actions on it.
  return <Panel className="connection-panel admin-section" eyebrow="PLANNING DATA" title="Git storage" info="Baseline rules, release scopes and the region / role mapping are saved as one JSON file in a private GitHub repository; every save is a commit. Use a separate private repository (not the app's), with a fine-grained token limited to it with Contents: Read and write. The token stays in this browser." action={<Pill tone={tone[git.status]}>{label[git.status]}</Pill>}>
    {git.config ? <SettingsSummary rows={[['Repository', `${git.config.owner}/${git.config.repo}`], ['Branch', git.config.branch], ['Data file', git.config.path], ['Token', git.connected ? git.readOnly ? 'Saved here · read only' : 'Saved here' : 'Not entered']]} /> : <p className="muted">Not connected: the shared setup (connections, Feature setup, holidays and activities, regions and roles) comes from a private GitHub repository your team uses.</p>}
    <div className="button-row"><button type="button" className={git.connected ? 'ghost' : 'primary'} onClick={() => setOpen(true)}>{git.connected ? 'Change connection…' : 'Connect Git storage…'}</button>{git.connected && <><button type="button" className="ghost" disabled={git.status === 'loading' || git.status === 'saving'} onClick={() => { if (confirmReplace(git.dirty, git.status === 'conflict')) void git.load() }}>Load latest</button><button type="button" className="ghost" onClick={git.disconnect}>Disconnect</button></>}</div>
    {open && <Modal title={git.connected ? 'Change Git storage' : 'Connect Git storage'} eyebrow="SETTINGS · STORAGE" wide form onClose={() => setOpen(false)}>
      <GitConnectionForm git={git} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
    </Modal>}
    {/* GIT-25, GIT-26: the connection setup not synced (repository unreadable), or first synced from another repository. */}
    {git.viewsAlert && <Notice tone="warning" className="git-views-alert">{git.viewsAlert}</Notice>}
    {git.message && <Notice tone={git.status === 'error' || git.status === 'conflict' ? 'error' : git.status === 'empty' ? 'warning' : 'info'}>{git.message}{git.history && git.connected && <> · <a href={git.history} target="_blank" rel="noreferrer">History in GitHub</a></>}</Notice>}
  </Panel>
}

// The Git storage connection form (repository, branch, data file — whose folder holds every shared file — and token):
// in the Git storage panel's pop-up and, after a failed forced load (GIT-31), inside that pop-up. The token is saved in
// this browser or desktop app only (saveGitToken), never in Git. onDone: after the connection was saved and loaded.
export function GitConnectionForm({ git, onDone, onCancel }: { git: GitStorage; onDone: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ ...defaultGitRepository, ...git.config })
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(true)
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }) })
  return <form className="connection-form" onSubmit={(event) => { event.preventDefault(); if (!confirmReplace(git.dirty)) return; void git.connect(form, token, remember).then(() => { setToken(''); onDone() }) }}>
    <label>Owner (user or organisation)<input required {...field('owner')} placeholder={defaultGitRepository.owner} /></label>
    <label>Repository<input required {...field('repo')} placeholder={defaultGitRepository.repo} /></label>
    <label>Branch<input {...field('branch')} placeholder="main" /></label>
    <label>Data file<input {...field('path')} placeholder={defaultGitPath} /></label>
    <label className="wide-field">GitHub token<input type="password" autoComplete="off" required={!git.connected} value={token} onChange={(event) => setToken(event.target.value)} placeholder={git.connected ? 'Saved in this browser — enter a new one to replace it' : 'github_pat_…'} /><small>Fine-grained token limited to this repository: Contents Read (to use the app) or Read and write (to save).</small></label>
    <label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember token in this browser</label>
    <div className="connection-actions"><button className="primary" disabled={git.status === 'loading' || git.status === 'saving'}>{git.connected ? 'Update & load' : 'Connect & load'}</button>{onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}</div>
  </form>
}

// Shown where planning data is edited: whether changes are only in this browser, unsaved, or committed.
export function GitSyncBar({ git, onOpenSettings }: { git: GitStorage; onOpenSettings?: () => void }) {
  const [commit, setCommit] = useState('')
  if (!git.connected) return <Notice tone="warning" className="git-bar">Baselines, the region / role mapping and the capacity settings (holidays and common activities included) are saved only in this browser until Git storage is connected.{onOpenSettings && <> <button type="button" className="text-button" onClick={onOpenSettings}>Set up Git storage →</button></>}</Notice>
  if (git.status === 'error' || git.status === 'conflict') return <Notice tone="error" className="git-bar">{git.message} <button type="button" className="text-button" onClick={() => { if (confirmReplace(git.dirty, git.status === 'conflict')) void git.load() }}>Load latest from Git</button></Notice>
  if (git.readOnly) return <Notice tone="info" className="git-bar">View only: your Git token can read but not save, so baselines, the mapping and the capacity settings are shown as in Git. Ask a People Manager (or anyone with write access) to change them.</Notice>
  if (git.isSample && (git.dirty || git.status === 'empty')) return <Notice tone="warning" className="git-bar">Synthetic sample data is loaded: changes stay in this browser and are not saved to Git.</Notice>
  if (git.dirty || git.status === 'empty') return <form className="git-bar git-bar-dirty" onSubmit={(event) => { event.preventDefault(); void git.save(commit).then(() => setCommit('')) }}>
    <span><strong>Unsaved changes</strong> — not yet in Git</span>
    <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change (e.g. CP v3.1: 2 assets scoped in)" />
    <button className="primary" disabled={git.status === 'saving'}>{git.status === 'saving' ? 'Saving…' : 'Save to Git'}</button>
  </form>
  return <p className="git-bar git-bar-synced"><Pill tone={tone[git.status]}>{label[git.status]}</Pill> {git.status === 'loading' ? git.message : <>Saved in Git · <a href={git.history} target="_blank" rel="noreferrer">history</a></>}</p>
}
