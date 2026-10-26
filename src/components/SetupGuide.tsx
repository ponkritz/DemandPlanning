import { Modal, Pill } from './ui'
import type { SetupStep } from '../setupGuide'
import type { SettingsTab } from '../settingsTabs'

// The "Get started" pop-up: each setup step with its live status, why it matters, how to do it, and a button that
// opens the right place. Dismissing it keeps it closed in this browser; the top-bar button reopens it.
const stateLabel = { done: 'Done', todo: 'To do', blocked: 'After the step above' } as const
const stateTone = { done: 'open', todo: 'warning', blocked: 'neutral' } as const
export function SetupGuide({ steps, busy, onOpenTab, onFetch, onClose, onDismiss }: { steps: SetupStep[]; busy: boolean; onOpenTab: (tab: SettingsTab) => void; onFetch: () => void; onClose: () => void; onDismiss: () => void }) {
  const required = steps.filter((step) => step.required), optional = steps.filter((step) => !step.required)
  const doneCount = required.filter((step) => step.state === 'done').length
  const next = steps.find((step) => step.state === 'todo')
  const card = (step: SetupStep, index: number) => <li key={step.id} className={`setup-step setup-step-${step.state}${step === next ? ' setup-step-next' : ''}`}>
    <div className="setup-step-head"><span className="setup-step-number" aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</span><strong>{step.title}</strong><Pill tone={stateTone[step.state]}>{stateLabel[step.state]}</Pill></div>
    {step.state !== 'done' && <>
      <p className="muted">{step.why}</p>
      <ol className="setup-how">{step.how.map((line) => <li key={line}>{line}</li>)}</ol>
      <div className="button-row">
        {step.tab && <button type="button" className={step === next ? 'primary' : 'ghost'} disabled={step.state === 'blocked'} onClick={() => onOpenTab(step.tab!)}>Open {step.tab === 'storage' ? 'Storage' : step.tab === 'resources' ? 'Resources' : 'Azure DevOps'} settings</button>}
        {step.action === 'fetch' && <button type="button" className={step === next ? 'primary' : 'ghost'} disabled={step.state === 'blocked' || busy} onClick={onFetch}>{busy ? 'Fetching…' : 'Fetch now'}</button>}
      </div>
    </>}
  </li>
  return <Modal title="Get started" eyebrow={`SETUP · ${doneCount} OF ${required.length} REQUIRED STEPS DONE`} onClose={onClose}>
    <div className="setup-guide">
      <p>{doneCount === required.length ? 'You are set up. The optional steps below add releases and region-specific capacity.' : 'Four steps make the app work for you; each one opens the right settings. You can close this and come back with the Setup button in the top bar.'}</p>
      <ol className="setup-steps">{required.map((step, index) => card(step, index))}</ol>
      <h3>Optional</h3>
      <ol className="setup-steps">{optional.map((step, index) => card(step, required.length + index))}</ol>
      <div className="modal-actions"><button type="button" className="ghost" onClick={onDismiss}>Don’t show again automatically</button><button type="button" className="primary" onClick={onClose}>Close</button></div>
    </div>
  </Modal>
}
