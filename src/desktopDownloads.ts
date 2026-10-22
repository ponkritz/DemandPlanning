// Installers are published by CI to one rolling GitHub release with fixed file names, so these links never change.
const release = 'https://github.com/neurolooom-eng/Test2/releases'
export const desktopDownloads = {
  windows: `${release}/download/desktop-latest/Demand-Planning-Hub-Setup.exe`,
  mac: `${release}/download/desktop-latest/Demand-Planning-Hub-mac.dmg`,
  checksums: `${release}/tag/desktop-latest`,
}
export type DesktopOs = 'windows' | 'mac' | 'other'
export function detectOs(userAgent: string): DesktopOs {
  if (/windows/i.test(userAgent)) return 'windows'
  if (/macintosh|mac os x/i.test(userAgent) && !/iphone|ipad/i.test(userAgent)) return 'mac'
  return 'other'
}
