import { useState } from 'react'
import type { GitStorage } from '../useGitStorage'
import { GitConnectionForm } from './GitStorage'
import { Modal, Notice } from './ui'
import { isGitOutage } from '../streamsUpdate'

// GIT-29…GIT-31: the forced "Load everything from Git". A blocking pop-up (Modal blocking: no ×, no Escape, no click
// beside it) whose only action loads everything shared through Git, as Admin → Data & sharing → Load everything does.
// It cannot be skipped (product owner, 2026-11-26) — except during a GitHub outage (GIT-32: every failure a server
// error or no answer), when Continue without loading closes it for this session; it comes back at the next start. After a failed load it names each part that failed and shows the
// Git storage connection setup inside the pop-up — the same form as Admin → Data & sharing → Git storage
// (GitConnectionForm; the token stays in this browser or desktop app) — with Retry, which loads with the connection
// saved. Its state (busy, failed) is held by the app, so the pop-up stays open, and its load is not started twice,
// while the load itself changes what the app shows (the planning data reloading, this computer's own save).
export function StreamsUpdatePrompt({ git, busy, failed, onRun, onContinue }: { git: GitStorage; busy: boolean; failed?: string[]; onRun: () => void; onContinue: () => void }) {
  const [saved, setSaved] = useState('')
  const failedNow = failed && !busy
  const outage = Boolean(failedNow) && isGitOutage(failed)
  return <Modal title="Load everything from Git" eyebrow="GIT · STREAMS CHANGED" blocking wide={Boolean(failedNow)} onClose={() => undefined}>
    <div className="streams-update">
      <p>The shared Streams setup in Git has changed since this computer last loaded it. Load everything from Git before you go on, so your Stream mapping, connections and data are the same as everyone else's.</p>
      <p className="muted">Your PATs, your work email and your own Other views stay as they are; nothing is written to Azure DevOps.</p>
      {failedNow && <Notice tone="error" className="streams-update-failed"><strong>Not everything was loaded. What failed:</strong><ul>{failed.map((line) => <li key={line}>{line}</li>)}</ul>Check the Git storage connection below and correct it if needed, then press Retry. If GitHub itself does not answer (an error 500 or 503, no network), Retry once it is back.{outage && <> <strong>GitHub is not answering (an outage):</strong> you can continue without loading for now — this pop-up comes back at the next start.</>}</Notice>}
      {failedNow && <section className="streams-update-setup" aria-label="Git storage connection">
        <h3>Git storage connection</h3>
        {git.config && <p className="muted">Now: {git.config.owner}/{git.config.repo} · branch {git.config.branch} · {git.config.path}{git.connected ? '' : ' · no token'}</p>}
        <GitConnectionForm git={git} onDone={() => setSaved('Saved: the connection is updated. Press Retry to load everything with it.')} />
        {git.message && git.status === 'error' && <Notice tone="error">{git.message}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
      </section>}
      <div className="modal-actions">
        {outage && <button type="button" onClick={onContinue}>Continue without loading</button>}
        <button type="button" className="primary" autoFocus disabled={busy} onClick={() => { setSaved(''); onRun() }}>{busy ? 'Loading…' : failed ? 'Retry' : 'Load everything from Git'}</button>
      </div>
    </div>
  </Modal>
}
