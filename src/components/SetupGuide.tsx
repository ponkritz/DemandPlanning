import { useState } from 'react'
import { Info, Modal, Pill } from './ui'
import { defaultGitRepository, type SetupLinks } from '../gitStorage'
import type { SetupInput, SetupStep } from '../setupGuide'
import type { SettingsTab } from '../settingsTabs'

// The "Get started" pop-up: each setup step in one line — its title, status and the field it needs — with why and how
// in its ⓘ (NAV-40), a link to where the token is created, and a button that opens the right place. Dismissing it keeps it closed in this browser; the top-bar button reopens it.
// NAV-38: the values a step needs (the Git token, your work email, your Azure DevOps PAT) can be entered right here;
// each is saved exactly as its Settings page saves it (tokens in this browser only, never in Git). The email field
// lets the browser suggest the address it has saved (autocomplete "email"), as Settings → Your work email does.
// detectEmail (NAV-39): reads the token owner's email from their work items; the found email fills the field and is saved
// only when the user presses Save email.
export interface SetupInputs { connectGit: (token: string) => Promise<void>; saveEmail: (email: string) => void; savePat: (pat: string) => void; detectEmail?: () => Promise<{ email: string; name: string; via: string } | null>; gitMessage?: string }
const inputLabel: Record<SetupInput, { label: string; placeholder: string; button: string; secret: boolean }> = {
  'git-token': { label: 'GitHub token', placeholder: `github_pat_… for ${defaultGitRepository.owner}/${defaultGitRepository.repo}`, button: 'Connect', secret: true },
  email: { label: 'Your work email', placeholder: 'name@company.com', button: 'Save email', secret: false },
  pat: { label: 'Azure DevOps PAT', placeholder: 'Paste your token', button: 'Save PAT', secret: true },
}
function StepInput({ kind, disabled, inputs }: { kind: SetupInput; disabled: boolean; inputs: SetupInputs }) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const meta = inputLabel[kind]
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const clean = value.trim()
    if (!clean) return
    if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setNote({ tone: 'error', text: 'Enter an email address.' }); return }
    setBusy(true); setNote(null)
    try {
      if (kind === 'git-token') await inputs.connectGit(clean)
      else if (kind === 'email') inputs.saveEmail(clean)
      else inputs.savePat(clean)
      setValue(''); setNote({ tone: 'ok', text: kind === 'git-token' ? 'Connecting… the step turns Done when the shared setup is loaded.' : 'Saved in this browser.' })
    } catch (failure) { setNote({ tone: 'error', text: failure instanceof Error ? failure.message : 'Not saved.' }) }
    finally { setBusy(false) }
  }
  async function detect() {
    if (!inputs.detectEmail) return
    setBusy(true); setNote(null)
    try {
      const found = await inputs.detectEmail()
      if (found) { setValue(found.email); setNote({ tone: 'ok', text: `Found ${found.name ? `${found.name}, ` : ''}${found.email} (${found.via} on your work items). Check it and press Save email.` }) }
      else setNote({ tone: 'error', text: 'No work item is assigned to, created or changed by you yet, so the email could not be read. Type it instead.' })
    } catch (failure) { setNote({ tone: 'error', text: failure instanceof Error ? failure.message : 'The email could not be read.' }) }
    finally { setBusy(false) }
  }
  return <form className="setup-input" onSubmit={(event) => void submit(event)}>
    <label><span className="sr-only">{meta.label}</span><input type={meta.secret ? 'password' : 'email'} name={meta.secret ? undefined : 'email'} autoComplete={meta.secret ? 'off' : 'email'} value={value} placeholder={meta.placeholder} disabled={disabled || busy} onChange={(event) => setValue(event.target.value)} /></label>
    <button type="submit" className="primary" disabled={disabled || busy || !value.trim()}>{busy ? 'Saving…' : meta.button}</button>
    {note && <small className={note.tone === 'error' ? 'negative' : 'muted'} role={note.tone === 'error' ? 'alert' : 'status'}>{note.text}</small>}
    {kind === 'email' && inputs.detectEmail && <button type="button" className="ghost setup-detect" disabled={disabled || busy} onClick={() => void detect()}>{busy ? 'Reading…' : 'Detect from my token'}</button>}
    {kind === 'git-token' && inputs.gitMessage && <small className="muted">{inputs.gitMessage}</small>}
  </form>
}
const stateLabel = { done: 'Done', todo: 'To do', blocked: 'After the step above' } as const
const stateTone = { done: 'open', todo: 'warning', blocked: 'neutral' } as const
const linkLabel = { github: 'Create a GitHub token', azure: 'Create an Azure DevOps PAT', tfs: 'Create a TFS APAC PAT' } as const
// NAV-40: the token links an admin sets (shared in Git); empty = the default shown as placeholder.
function LinksEditor({ links, defaults, onChange, saveBar }: { links: SetupLinks; defaults: SetupLinks; onChange: (links: SetupLinks) => void; saveBar?: React.ReactNode }) {
  return <details className="setup-links-edit"><summary>Token links (admin)</summary>
    <div className="setup-links-grid">{(['github', 'azure', 'tfs'] as const).map((key) => <label key={key}>{linkLabel[key]}<input type="url" value={links[key] ?? ''} placeholder={defaults[key] ?? 'https://… (no link yet)'} onChange={(event) => onChange({ ...links, [key]: event.target.value })} /></label>)}</div>
    <small className="muted">https links only; empty uses the default. Shared with everyone through Git.</small>
    {saveBar}
  </details>
}
export function SetupGuide({ steps, busy, inputs, links, linkDefaults, editLinks, onOpenTab, onFetch, onClose, onDismiss }: { steps: SetupStep[]; busy: boolean; inputs?: SetupInputs; links?: SetupLinks; linkDefaults?: SetupLinks; editLinks?: { links: SetupLinks; onChange: (links: SetupLinks) => void; saveBar?: React.ReactNode }; onOpenTab: (tab: SettingsTab, section?: string) => void; onFetch: () => void; onClose: () => void; onDismiss: () => void }) {
  const required = steps.filter((step) => step.required), optional = steps.filter((step) => !step.required)
  const doneCount = required.filter((step) => step.state === 'done').length
  const next = steps.find((step) => step.state === 'todo')
  const card = (step: SetupStep, index: number) => <li key={step.id} className={`setup-step setup-step-${step.state}${step === next ? ' setup-step-next' : ''}`}>
    <div className="setup-step-head"><span className="setup-step-number" aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</span><strong>{step.title}</strong><Info label="Info"><p>{step.why}</p><ol className="setup-how">{step.how.map((line) => <li key={line}>{line}</li>)}</ol></Info><Pill tone={stateTone[step.state]}>{stateLabel[step.state]}</Pill></div>
    {step.state !== 'done' && <>
      {step.input && inputs && <StepInput kind={step.input} disabled={step.state === 'blocked'} inputs={inputs} />}
      <div className="button-row">
        {step.link && links?.[step.link] && <a className="text-button setup-link" href={links[step.link]} target="_blank" rel="noreferrer">{linkLabel[step.link]} ↗</a>}
        {step.tab && <button type="button" className={step.input && inputs ? 'text-button' : step === next ? 'primary' : 'ghost'} disabled={step.state === 'blocked'} onClick={() => onOpenTab(step.tab!, step.section)}>Settings</button>}
        {step.action === 'fetch' && <button type="button" className={step === next ? 'primary' : 'ghost'} disabled={step.state === 'blocked' || busy} onClick={onFetch}>{busy ? 'Fetching…' : 'Fetch now'}</button>}
      </div>
    </>}
  </li>
  return <Modal title="Get started" eyebrow={`SETUP · ${doneCount} OF ${required.length} REQUIRED STEPS DONE`} onClose={onClose}>
    <div className="setup-guide">
      <p className="muted">{doneCount === required.length ? 'You are set up.' : 'Four steps. ⓘ explains each one.'}</p>
      <ol className="setup-steps">{required.map((step, index) => card(step, index))}</ol>
      <h3>Optional</h3>
      <ol className="setup-steps">{optional.map((step, index) => card(step, required.length + index))}</ol>
      {editLinks && <LinksEditor links={editLinks.links} defaults={linkDefaults ?? {}} onChange={editLinks.onChange} saveBar={editLinks.saveBar} />}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onDismiss}>Don’t show again automatically</button><button type="button" className="primary" onClick={onClose}>Close</button></div>
    </div>
  </Modal>
}
