import { useState } from 'react'
import { filterTiles, type HomeTile } from '../homeTiles'
import { Page } from '../components/ui'

// At most this many links per tile; “+n more” shows the rest in the tile, as does a search.
const maxLinks = 6

// NAV-42…44 Home: the start page — a tile per area of the app (soft colour per area), the tile opening the area's main
// page and its small buttons opening each of its pages; a search filters tiles and links.

export function HomePage({ tiles, name }: { tiles: HomeTile[]; name?: string }) {
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<string[]>([])
  const shown = filterTiles(tiles, query)
  return <Page>
    <div className="home">
      <div className="home-head">
        <p className="home-hello">{name ? `Hello ${name.split(' ')[0]} — where to?` : 'Where to?'}</p>
        <label className="home-search"><span className="sr-only">Search pages</span><input type="search" aria-label="Search pages" placeholder="Search pages, streams and settings…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {shown.length ? <div className="home-grid" role="list">{shown.map((tile) => <article key={tile.key} role="listitem" className={`home-tile home-tone-${tile.tone}`} aria-label={tile.title}>
        <button type="button" className="home-tile-main" onClick={tile.open} title={tile.detail} aria-label={`Open ${tile.title}${tile.badge ? ` (${tile.badge})` : ''}`}>
          <span className="home-tile-title">{tile.title}</span>
          {tile.badge && <span className="home-tile-badge">{tile.badge}</span>}
          <small className="home-tile-detail">{tile.detail}</small>
        </button>
        {tile.links.length > 0 && <div className="home-links" aria-label={`${tile.title} pages`}>
          {(query.trim() || opened.includes(tile.key) ? tile.links : tile.links.slice(0, maxLinks)).map((link) => <button key={link.key} type="button" className={`home-link${link.note ? ' home-link-note' : ''}`} title={link.note ? `${link.label} — ${link.note}` : link.label} aria-label={link.label} onClick={link.open}><span aria-hidden="true" className="home-link-icon">{link.icon}</span><span className="home-link-label">{link.label}</span></button>)}
          {!query.trim() && !opened.includes(tile.key) && tile.links.length > maxLinks && <button type="button" className="home-link home-link-more" onClick={() => setOpened((now) => [...now, tile.key])} aria-label={`Show ${tile.links.length - maxLinks} more ${tile.title} pages`}>+{tile.links.length - maxLinks} more</button>}
        </div>}
      </article>)}</div> : <p className="muted home-empty">Nothing matches “{query.trim()}”.</p>}
    </div>
  </Page>
}
