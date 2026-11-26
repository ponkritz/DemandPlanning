# Home

**Route:** `home`. The default Tile view opens on Home. Classic view opens on My dashboard and removes Home from the sidebar.

## Default design

A short greeting and page-search field sit above a responsive tile grid. Tile titles open the area's primary destination. Small buttons open individual pages. Each tile initially shows up to six links, with an expansion button for the rest. My Work can show the count of open items when the person is identified and work data is available.

## Logic and implementation

1. [App.tsx](../../src/App.tsx) builds tile links from allowed application routes, settings permissions, current Azure connection mapping and Windchill exports. Unavailable Azure stream mappings open connection settings. A missing Windchill export opens its import path. A tile with no primary action uses its first available link, and a tile without a destination is omitted.
2. [HomePage.tsx](../../src/pages/HomePage.tsx) owns search and expanded tiles for the mounted view. The search tests every normalized query word against the tile title and description. Matching tiles keep all links. Otherwise only matching link labels or notes are shown. A search reveals all matching links, regardless of the normal six-link limit.
3. [homeTiles.ts](../../src/homeTiles.ts) implements the search and start-view preference. [ProfileMenu.tsx](../../src/components/ProfileMenu.tsx) exposes Classic / Tile view. The preference is browser-local and defaults to Tiles if missing or inaccessible.

Home reads app context for role and work indicators. Search and navigation make no data writes. Empty results display the submitted search phrase. See [Home tile tests](../../tests/home-tiles.test.mjs).

The **Resource Mapping** tile opens the On-Demand page named Resource Mapping. Home uses the same allowed page link as the menu, so the tile appears only when the page exists and the viewer may open it.
