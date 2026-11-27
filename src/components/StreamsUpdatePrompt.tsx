import { useState } from 'react'
import type { GitStorage } from '../useGitStorage'
import { GitConnectionForm } from './GitStorage'
import { Modal, Notice } from './ui'
import { isGitOutage } from '../streamsUpdate'

// GIT-29…GIT-31, GIT-36: the forced "Load latest Release Details" (the Stream mapping only; until v12.2 Load everything). A blocking pop-up (Modal blocking: no ×, no Escape, no click
// beside it) whose only action loads the Stream mapping (azure-views.json with the person's Other views, custom-streams.json).
// It cannot be skipped (product owner, 2026-11-26) — except during a GitHub outage (GIT-32: every failure a server
// error or no answer), when Continue without loading closes it for this session; it comes back at the next start. After a failed load it names each part that failed and shows the
// Git storage connection setup inside the pop-up — the same form as Admin → Data & history → Git storage
// (GitConnectionForm; the token stays in this browser or desktop app) — with Retry, which loads with the connection
// saved. GIT-33…GIT-35: Load latest Release Details (and Retry) starts the load as a background job (Jobs done) and the
// pop-up closes at once; the app hides it while the job runs and brings it back in this failed state when the job fails.
export function StreamsUpdatePrompt({ git, failed, onRun, onContinue }: { git: GitStorage; failed?: string[]; onRun: () => void; onContinue: () => void }) {
  const [saved, setSaved] = useState('')
  const failedNow = failed
  const outage = Boolean(failedNow) && isGitOutage(failed)
  return <Modal title="Load latest Release Details" eyebrow="RELEASE DETAILS · STREAM MAPPING CHANGED" blocking wide={Boolean(failedNow)} onClose={() => undefined}>
    <div className="streams-update">
      <p>The shared Stream mapping in Git has changed since this computer last loaded it. Load it before you go on, so the Release Details pages read the same streams and queries as everyone else's.</p>
      <p className="muted">Only the Stream mapping is loaded (with the custom streams and your own Other views), in the background — see Background jobs; this pop-up comes back only if it fails. Your PATs and work email stay as they are; nothing is written to Azure DevOps.</p>
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
        <button type="button" className="primary" autoFocus onClick={() => { setSaved(''); onRun() }}>{failed ? 'Retry' : 'Load latest Release Details'}</button>
      </div>
    </div>
  </Modal>
}
