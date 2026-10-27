import { useId } from 'react'

// The app mark: a planning calendar with planned rows (demand planning) and a quality shield with a check (quality),
// the shield cut out of the calendar and the check cut out of the shield so the tile shows through at any size.
// Drawn in the current text colour on the sidebar's gradient tile; public/favicon.svg carries the same glyph.
const shield = 'M23.5 15.6l6 2.3v4.6c0 3.9-2.6 6.3-6 7.6-3.4-1.3-6-3.7-6-7.6v-4.6z'
export function BrandMark({ size = 22 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <mask id={`${id}-gap`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32"><rect width="32" height="32" fill="#fff" /><path d={shield} fill="#000" stroke="#000" strokeWidth="4" strokeLinejoin="round" /></mask>
      <mask id={`${id}-check`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32"><rect width="32" height="32" fill="#fff" /><path d="M20.7 22.6l2 2 3.7-3.9" stroke="#000" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></mask>
    </defs>
    <g mask={`url(#${id}-gap)`} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <rect x="3" y="6" width="22" height="20" rx="3.5" />
      <path d="M3 12h22M9 3.5v5M19 3.5v5" />
      <path d="M8 17h4M8 21h7" strokeWidth="2.4" opacity=".7" />
    </g>
    <path d={shield} fill="currentColor" mask={`url(#${id}-check)`} />
  </svg>
}
