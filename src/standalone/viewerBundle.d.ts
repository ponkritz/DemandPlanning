// OND-98: the built viewer of a published interactive HTML file, as text (vite.config.ts, plugin standalone-viewer).
declare module 'virtual:standalone-viewer' {
  export const viewerJs: string
  export const viewerCss: string
}
