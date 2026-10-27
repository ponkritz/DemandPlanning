// The app mark: three rising bars (demand planning) under a check (quality). Drawn in the current text colour so the
// sidebar's gradient tile stays its background; public/favicon.svg carries the same glyph on the tile itself.
export function BrandMark({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    <rect x="5" y="18" width="5" height="9" rx="1.2" fill="currentColor" opacity=".55" />
    <rect x="13.5" y="13" width="5" height="14" rx="1.2" fill="currentColor" opacity=".55" />
    <rect x="22" y="8" width="5" height="19" rx="1.2" fill="currentColor" opacity=".55" />
    <path d="M5.5 15.5 12 21.5 26.5 6" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
