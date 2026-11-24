import { oneLine, safeName } from './printExport.ts'
import { dataElementId, type PublishedFile } from './publishData.ts'

// OND-90, OND-94 Publish an interactive HTML dashboard: the one self-contained, offline .html file — the viewer's
// script and styles (src/standalone/, built with the app, OND-98) inline, and the published data (src/publishData.ts) as
// a JSON data block the viewer reads. Data never becomes markup here: the title is HTML-escaped, the JSON is escaped so
// that no "<", "-->", U+2028 or U+2029 can end the block, and the viewer draws everything with React. A
// Content-Security-Policy in the file allows only its own script and its own styles (each by its SHA-256 hash) and
// data: images, and nothing else — no request of any kind (no connect-src, no fonts, no frames, no forms, no base).
// Nothing here touches the DOM or the network.

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)
export const publishFileName = (pageName: string) => `${safeName(pageName)}.html`

// The data block: JSON with every "<", ">" and "&" and the line separators U+2028 / U+2029 as \u escapes (the same
// value for JSON.parse; nothing that HTML or an older script parser reads as the end of the block).
export const embedJson = (value: unknown) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
// The viewer's script and styles as they go inline: "</script" / "</style" and "<!--" cannot end or bend the element
// (in JavaScript and CSS strings "<\/" is the same text). The CSP hashes are of this exact text.
export const inlineScript = (js: string) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')
export const inlineStyle = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1')

// A text's hash for the Content-Security-Policy (base64 SHA-256).
export async function sha256Base64(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary)
}
// No request of any kind leaves the file: its own script and styles by hash, data: images, nothing else.
export const publishCsp = (scriptHash: string, styleHash: string) => `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; img-src data:; base-uri 'none'; form-action 'none'`

// The whole file. viewer: the built viewer (its script and styles); data: what it shows.
export async function buildStandaloneHtml(data: PublishedFile, viewer: { js: string; css: string }) {
  const script = inlineScript(viewer.js), style = inlineStyle(viewer.css)
  const [scriptHash, styleHash] = await Promise.all([sha256Base64(script), sha256Base64(style)])
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${publishCsp(scriptHash, styleHash)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="Demand Planning Hub — interactive HTML">
<title>${escapeHtml(oneLine(data.name))}</title>
<style>${style}</style>
</head>
<body>
<div id="root"></div>
<noscript><p>${escapeHtml(data.name)}: this published dashboard needs JavaScript. Published by ${escapeHtml(data.meta.by || 'unknown')} on ${escapeHtml(data.meta.at)}.</p></noscript>
<script type="application/json" id="${dataElementId}">${embedJson(data)}</script>
<script>${script}</script>
</body>
</html>
`
}
