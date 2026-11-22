// NAV-42…44 Home: the start page as a grid of tiles, one per area of the app, each opening the area's main page and
// carrying quick links straight to its pages. Built from the pages the viewer may open, so a tile or link the person's
// roles do not include is not shown. A search filters tiles and links by name.

export type HomeTone = 'peach' | 'mint' | 'sky' | 'lemon' | 'lilac' | 'rose' | 'sand' | 'teal'
export interface HomeLink { key: string; label: string; icon: string; open: () => void; note?: string }
export interface HomeTile { key: string; title: string; detail: string; tone: HomeTone; open: () => void; links: HomeLink[]; badge?: string }

const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean)
const has = (text: string, query: string) => words(query).every((word) => text.toLowerCase().includes(word))

/** The tiles for a search: a tile whose title or description matches keeps all its links; otherwise only its matching
 * links are kept, and a tile without any is left out. An empty search keeps everything. */
export function filterTiles(tiles: HomeTile[], query: string): HomeTile[] {
  if (!words(query).length) return tiles
  return tiles.flatMap((tile) => {
    if (has(`${tile.title} ${tile.detail}`, query)) return [tile]
    const links = tile.links.filter((link) => has(`${link.label} ${link.note ?? ''}`, query))
    return links.length ? [{ ...tile, links }] : []
  })
}

/** Tiles without a way in are dropped: an area the person may not open and that has no link they may open. */
export const visibleTiles = (tiles: (HomeTile | null)[]): HomeTile[] => tiles.filter((tile): tile is HomeTile => Boolean(tile))

// NAV-46: each person chooses the tile view (the app opens on Home, which is in the menu) or the classic view (it opens on
// My dashboard, without Home), with a switch at the top of the menu. Kept in this browser only; the tile view is the default.
export type StartView = 'tiles' | 'classic'
export const startViewKey = 'demand-planning-start-view-v1'
export function loadStartView(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): StartView {
  try { return storage?.getItem(startViewKey) === 'classic' ? 'classic' : 'tiles' } catch { return 'tiles' }
}
export function saveStartView(view: StartView, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): StartView {
  try { storage?.setItem(startViewKey, view) } catch { /* private mode: the choice lasts for this page load */ }
  return view
}
export const startPageOf = (view: StartView) => view === 'classic' ? 'mydash' as const : 'home' as const
