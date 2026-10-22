import { useState } from 'react'
import { Modal, Notice } from './ui'
import { desktopDownloads, detectOs } from '../desktopDownloads'

// Sidebar entry and dialog for downloading the desktop app; hidden inside the desktop app itself.
export function DesktopDownload() {
  const [open, setOpen] = useState(false)
  if (typeof window !== 'undefined' && window.azureDevOps) return <p className="desktop-note">Desktop app</p>
  const os = detectOs(typeof navigator === 'undefined' ? '' : navigator.userAgent)
  return <>
    <button type="button" className="download-link" onClick={() => setOpen(true)}>⬇ Desktop app</button>
    {open && <Modal title="Download the desktop app" eyebrow="WINDOWS · MAC" onClose={() => setOpen(false)}>
      <p className="muted">The desktop app works like this site, but sends Azure DevOps requests itself. Use it for on-prem servers (on VPN), which usually block requests from a web page. Your data and PATs stay on your computer.</p>
      <div className="download-grid">
        <a className={`download-card ${os === 'windows' ? 'download-recommended' : ''}`} href={desktopDownloads.windows}>
          <strong>Windows</strong><span>Installer (.exe)</span>{os === 'windows' && <em>Recommended for this computer</em>}
        </a>
        <a className={`download-card ${os === 'mac' ? 'download-recommended' : ''}`} href={desktopDownloads.mac}>
          <strong>macOS</strong><span>Disk image (.dmg) · Intel and Apple silicon</span>{os === 'mac' && <em>Recommended for this computer</em>}
        </a>
      </div>
      <Notice tone="warning">The installers are not code-signed yet. <strong>Windows:</strong> if SmartScreen says “Windows protected your PC”, choose <em>More info → Run anyway</em>. <strong>macOS:</strong> open the app once with <em>right-click → Open</em>; if macOS says the app is damaged, run <code>xattr -cr "/Applications/Demand Planning Hub.app"</code> in Terminal. Your IT policy may block unsigned apps.</Notice>
      <p className="muted">Always the latest build from main. Checksums (SHA-256) and release notes: <a href={desktopDownloads.checksums} target="_blank" rel="noreferrer">desktop-latest release</a>.</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button></div>
    </Modal>}
  </>
}
