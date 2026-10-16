import { useState } from 'react'
import { appBuild } from '../buildInfo'
import { formatBuildDate, prepareWebReload, readLatestBuild, reloadBlockReason, type BuildInfo } from '../appUpdate'
import { Modal } from './ui'

declare global { interface Window { appUpdates?: { reloadIgnoringCache: () => Promise<void> } } }

export function BuildStatus({ pending, failed, busy, preview, onBackup }: { pending: () => boolean; failed: boolean; busy: boolean; preview: boolean; onBackup?: () => void }) {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [latest, setLatest] = useState<BuildInfo | null>(null)
  const [error, setError] = useState('')
  const [exported, setExported] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [reloading, setReloading] = useState(false)
  const desktop = window.location.protocol === 'file:'
  async function check() {
    setChecking(true); setError('')
    try { setLatest(await readLatestBuild(window.location.href)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to check the deployed build.') }
    finally { setChecking(false) }
  }
  function show() { setOpen(true); setLatest(null); setError(''); setAcknowledged(false); setExported(false); if (!desktop) void check() }
  async function reload() {
    const reason = reloadBlockReason({ pending: pending(), failed, busy, preview, exported, acknowledged })
    if (reason) { setError(reason); return }
    setReloading(true); setError('')
    try {
      if (desktop) {
        if (window.appUpdates) await window.appUpdates.reloadIgnoringCache()
        else window.location.reload()
      } else {
        const result = await prepareWebReload(window.location.href)
        const changed = reloadBlockReason({ pending: pending(), failed, busy, preview, exported, acknowledged })
        if (changed) throw new Error(changed)
        window.location.replace(result.url)
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Update failed. Nothing was cleared.'); setReloading(false) }
  }
  return <div className="build-status"><strong>v{appBuild.version}</strong><small>Build ID: {appBuild.buildId}</small><small>Build date: {formatBuildDate(appBuild.builtAt)}</small><button className="force-update-button" onClick={show}>↻ Force Update</button>
    {open && <Modal title="Force Update" eyebrow="APP VERSION & BUILD" onClose={() => { if (!reloading) setOpen(false) }}><div className="build-update-body"><dl><dt>Running version</dt><dd>v{appBuild.version}</dd><dt>Build ID</dt><dd>{appBuild.buildId}</dd><dt>Built</dt><dd>{formatBuildDate(appBuild.builtAt)}</dd><dt>Source revision</dt><dd>{appBuild.revision.slice(0, 12)}</dd></dl>
      <p>{desktop ? 'Reloads the installed application without its HTTP cache. It does not download or install a newer desktop executable.' : 'Checks deployment metadata and fetches fresh app HTML with cache bypass, then reloads using a unique URL. This is the supported web equivalent—not a literal browser Ctrl+Shift+R command.'}</p><p>Saved IndexedDB data, PAT settings and column preferences are not cleared. Unfinished forms are not included in a JSON backup; save or cancel them before continuing.</p>
      {!desktop && <div className="notice" role="status">{checking ? 'Checking deployed build…' : latest ? latest.buildId === appBuild.buildId ? `Already running the latest deployed build: v${latest.version} (${latest.buildId}). You can still force a fresh reload.` : `Deployed: v${latest.version} · Build ${latest.buildId} · ${formatBuildDate(latest.builtAt)}` : 'No deployed build confirmed yet.'}</div>}
      {(failed || preview) && <div className="notice error">{failed ? 'Some changes are not saved.' : 'A fetched preview has not been saved.'} Export a JSON backup before updating. It includes the current fetched preview when present.</div>}
      {onBackup && <button className="ghost" disabled={reloading} onClick={() => { onBackup(); setExported(true) }}>Export JSON backup before updating</button>}
      <label className="checkbox-label"><input type="checkbox" checked={acknowledged} disabled={reloading} onChange={(event) => setAcknowledged(event.target.checked)} />I have saved my work or verified my downloaded backup, and understand that unfinished forms will be discarded.</label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="ghost" disabled={reloading} onClick={() => setOpen(false)}>Cancel</button>{!desktop && <button className="ghost" disabled={checking || reloading} onClick={() => void check()}>Check again</button>}<button className="primary" disabled={checking || reloading || !acknowledged || (!desktop && !latest) || ((failed || preview) && !exported)} onClick={() => void reload()}>{reloading ? 'Reloading fresh build…' : 'Force reload now'}</button></div>
    </div></Modal>}
  </div>
}
