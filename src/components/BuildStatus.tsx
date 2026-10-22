import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { appBuild } from '../buildInfo'
import { formatBuildDate, prepareWebReload, readLatestBuild, reloadBlockReason, type BuildInfo } from '../appUpdate'
import { formatDateTime } from '../format'
import { Modal } from './ui'

// Desktop app only: check the published desktop build and download, verify and start its installer.
export interface DesktopUpdateCheck { current: { buildNumber: number; revision: string; version: string }; latest: { buildNumber: number; revision: string; version: string; builtAt: string }; supported: boolean; available: boolean }
const dismissedKey = 'demand-planning-update-dismissed-v1'
declare global { interface Window { appUpdates?: { reloadIgnoringCache: () => Promise<void> }; desktopUpdate?: { check: () => Promise<DesktopUpdateCheck>; install: () => Promise<{ status: 'installer-started' | 'disk-image-opened'; buildNumber: number }>; onProgress: (listener: (progress: { received: number; total: number }) => void) => () => void } } }

export function BuildStatus({ pending, failed, busy, preview, onBackup }: { pending: () => boolean; failed: boolean; busy: boolean; preview: boolean; onBackup?: () => void }) {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [latest, setLatest] = useState<BuildInfo | null>(null)
  const [error, setError] = useState('')
  const [exported, setExported] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [reloading, setReloading] = useState(false)
  const desktop = window.location.protocol === 'file:'
  const updater = desktop ? window.desktopUpdate : undefined
  const [desktopCheck, setDesktopCheck] = useState<DesktopUpdateCheck | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState('')
  // Desktop app: check quietly at start and every 4 hours; a newer build shows an "Update available" notice until it
  // is installed or dismissed for that build. Failures (offline, VPN) stay silent here; the modal shows them.
  const [available, setAvailable] = useState<DesktopUpdateCheck | null>(null)
  const [dismissed, setDismissed] = useState(() => { try { return Number(localStorage.getItem(dismissedKey)) || 0 } catch { return 0 } })
  useEffect(() => {
    if (!updater) return
    let active = true
    const quietCheck = () => { updater.check().then((result) => { if (active) setAvailable(result.available ? result : null) }).catch(() => { /* shown only when checking from the modal */ }) }
    const first = window.setTimeout(quietCheck, 5000), timer = window.setInterval(quietCheck, 4 * 60 * 60 * 1000)
    return () => { active = false; window.clearTimeout(first); window.clearInterval(timer) }
  }, [updater])
  const dismiss = (build: number) => { setDismissed(build); try { localStorage.setItem(dismissedKey, String(build)) } catch { /* hidden for this session */ } }
  const notice = available && available.latest.buildNumber > dismissed && !open ? createPortal(<div className="update-toast" role="status"><div><strong>Update available</strong><span>Build {available.latest.buildNumber} is ready (installed: build {available.current.buildNumber || '—'}).</span></div><div className="button-row"><button className="primary" onClick={show}>Update now</button><button className="ghost" onClick={() => dismiss(available.latest.buildNumber)}>Later</button></div></div>, document.body) : null
  async function checkDesktop() {
    if (!updater) return
    setChecking(true); setError('')
    try { setDesktopCheck(await updater.check()) }
    catch (failure) { setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Unable to check for updates.') }
    finally { setChecking(false) }
  }
  async function check() {
    setChecking(true); setError('')
    try { setLatest(await readLatestBuild(window.location.href)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to check the deployed build.') }
    finally { setChecking(false) }
  }
  function show() { setOpen(true); setLatest(null); setDesktopCheck(null); setProgress(null); setDone(''); setError(''); setAcknowledged(false); setExported(false); if (!desktop) void check(); else void checkDesktop() }
  async function reload() {
    const reason = reloadBlockReason({ pending: pending(), failed, busy, preview, exported, acknowledged })
    if (reason) { setError(reason); return }
    setReloading(true); setError('')
    try {
      if (updater && desktopCheck?.available) {
        const stop = updater.onProgress(({ received, total }) => setProgress(Math.floor(received / total * 100)))
        try {
          const result = await updater.install()
          setDone(result.status === 'installer-started' ? `Build ${result.buildNumber} downloaded and verified. The installer is starting and this app will close; finish the installer, then open Demand Planning Hub again.` : `Build ${result.buildNumber} downloaded and verified. In the window that opened, drag Demand Planning Hub to Applications and choose Replace, then quit and reopen the app.`)
        } finally { stop() }
        setReloading(false)
      } else if (desktop) {
        if (window.appUpdates) await window.appUpdates.reloadIgnoringCache()
        else window.location.reload()
      } else {
        const result = await prepareWebReload(window.location.href)
        const changed = reloadBlockReason({ pending: pending(), failed, busy, preview, exported, acknowledged })
        if (changed) throw new Error(changed)
        window.location.replace(result.url)
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Update failed. Nothing was cleared.'); setReloading(false); setProgress(null) }
  }
  return <div className="build-status">{notice}<strong>v{appBuild.version}</strong><small>Build {appBuild.buildNumber || "—"} · ID {appBuild.buildId}</small><small title={formatBuildDate(appBuild.builtAt)}>Built {formatDateTime(appBuild.builtAt)}</small><button className="force-update-button" onClick={show}>{updater ? '↻ Check for updates' : '↻ Force Update'}</button>
    {open && <Modal title={updater ? 'Update the desktop app' : 'Force Update'} eyebrow="APP VERSION & BUILD" onClose={() => { if (!reloading) setOpen(false) }}><div className="build-update-body"><dl><dt>Running version</dt><dd>v{appBuild.version}</dd><dt>Build number</dt><dd>{appBuild.buildNumber || "—"}</dd><dt>Build ID</dt><dd>{appBuild.buildId}</dd><dt>Built</dt><dd>{formatBuildDate(appBuild.builtAt)}</dd><dt>Source revision</dt><dd>{appBuild.revision.slice(0, 12)}</dd></dl>
      <p>{updater ? 'Checks the latest published desktop build. Updating downloads its installer, verifies the SHA-256 checksum and starts it; the installer replaces the app files.' : desktop ? 'Reloads the installed application without its HTTP cache. It does not download or install a newer desktop executable.' : 'Checks deployment metadata and fetches fresh app HTML with cache bypass, then reloads using a unique URL. This is the supported web equivalent—not a literal browser Ctrl+Shift+R command.'}</p><p>Saved IndexedDB data, PAT settings and column preferences are not cleared. Unfinished forms are not included in a JSON backup; save or cancel them before continuing.</p>
      {!desktop && <div className="notice" role="status">{checking ? 'Checking deployed build…' : latest ? latest.buildId === appBuild.buildId ? `Already running the latest deployed build: v${latest.version} (${latest.buildId}). You can still force a fresh reload.` : `Deployed: v${latest.version} · Build ${latest.buildNumber ?? "—"} · ID ${latest.buildId} · ${formatBuildDate(latest.builtAt)}` : 'No deployed build confirmed yet.'}</div>}
      {updater && <div className={`notice${desktopCheck?.available ? ' success' : ''}`} role="status">{checking ? 'Checking for a newer desktop build…' : desktopCheck ? !desktopCheck.supported ? 'No installer is published for this operating system.' : desktopCheck.available ? `Build ${desktopCheck.latest.buildNumber} is available (installed: build ${desktopCheck.current.buildNumber || '—'}).` : `Up to date: build ${desktopCheck.current.buildNumber || '—'} is the latest published desktop build.` : 'Not checked yet.'}</div>}
      {progress != null && !done && <div className="update-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /><span>Downloading… {progress}%</span></div>}
      {done && <div className="notice success" role="status">{done}</div>}
      {(failed || preview) && <div className="notice error">{failed ? 'Some changes are not saved.' : 'A fetched preview has not been saved.'} Export a JSON backup before updating. It includes the current fetched preview when present.</div>}
      {onBackup && <button className="ghost" disabled={reloading} onClick={() => { onBackup(); setExported(true) }}>Export JSON backup before updating</button>}
      <label className="checkbox-label"><input type="checkbox" checked={acknowledged} disabled={reloading} onChange={(event) => setAcknowledged(event.target.checked)} />I have saved my work or verified my downloaded backup, and understand that unfinished forms will be discarded.</label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="ghost" disabled={reloading} onClick={() => setOpen(false)}>Cancel</button>{!desktop && <button className="ghost" disabled={checking || reloading} onClick={() => void check()}>Check again</button>}{updater && <button className="ghost" disabled={checking || reloading} onClick={() => void checkDesktop()}>Check again</button>}{updater && !desktopCheck?.available ? null : <button className="primary" disabled={checking || reloading || Boolean(done) || !acknowledged || (!desktop && !latest) || ((failed || preview) && !exported)} onClick={() => void reload()}>{updater ? reloading ? 'Downloading and verifying…' : `Download and install build ${desktopCheck?.latest.buildNumber}` : reloading ? 'Reloading fresh build…' : 'Force reload now'}</button>}</div>
    </div></Modal>}
  </div>
}
