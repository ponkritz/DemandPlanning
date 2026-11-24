import react from '@vitejs/plugin-react'
import { build, defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)) throw new Error('App version must be x.y.z with no prefix in package.json.')
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`) throw new Error('Release tag must match the package.json version exactly.')
let revision = process.env.GITHUB_SHA || 'unknown'
if (revision === 'unknown') { try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { /* Builds outside Git remain identifiable by timestamp. */ } }
const builtAt = new Date().toISOString()
let buildNumber = Number(process.env.GITHUB_RUN_NUMBER) || 0
if (!buildNumber) { try { buildNumber = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim()) || 0 } catch { /* Builds outside Git carry build number 0. */ } }
const metadata = { app: 'demandplanning', formatVersion: 1, version: pkg.version, buildId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT || '1'}` : `local-${revision.slice(0, 8)}-${builtAt.replace(/[^\d]/g, '')}`, builtAt, revision, buildNumber }

// SEC-CSP (NFR-09): the built page carries a Content-Security-Policy. Scripts only from the app itself (file: for the
// desktop app, which loads dist/index.html from disk); requests to any https host (dev.azure.com, on-premises servers,
// GitHub, Microsoft Graph); the Microsoft sign-in in a frame; no plugins, no foreign forms or base URL. Inline style
// attributes stay allowed (React style props). Video and audio only from the app's own files (the user guide's clips,
// DOC-13), never from another host. Not added to the dev server (its hot reload injects inline scripts).
export const contentSecurityPolicy = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' 'unsafe-inline' file:",
  "img-src 'self' data: blob: https: file:",
  "font-src 'self' data: file:",
  "media-src 'self' file:",
  "connect-src 'self' https: file:",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

// OND-98: the viewer of a published interactive HTML file (src/standalone/viewer.tsx) — React, the app's chart, filter and
// aggregation modules and the app's styles — built by a second Vite build into ONE script (IIFE, minified) and ONE
// stylesheet, with no other file and no network use. The app takes both as text (`virtual:standalone-viewer`, loaded
// only when a page is published) and writes them inline into the file it publishes; `vite build` also writes them to
// dist/standalone-viewer.js / .css (to see the size). Built on first use and kept for the run (dev server: on the first
// publish; restart it after changing the viewer).
const viewerModule = 'virtual:standalone-viewer'
let viewerBuild: Promise<{ js: string; css: string }> | null = null
function buildViewer() {
  viewerBuild ??= (async () => {
    const result = await build({
      configFile: false, root: fileURLToPath(new URL('.', import.meta.url)), logLevel: 'warn', mode: 'production',
      plugins: [react()],
      define: { __APP_BUILD__: JSON.stringify(metadata), 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        write: false, copyPublicDir: false, emptyOutDir: false, sourcemap: false, minify: true, cssMinify: true, reportCompressedSize: false,
        lib: { entry: 'src/standalone/viewer.tsx', formats: ['iife'], name: 'DemandPlanningViewer', fileName: () => 'standalone-viewer.js', cssFileName: 'standalone-viewer' },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    })
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => 'output' in entry ? entry.output : [])
    const js = outputs.filter((entry) => entry.type === 'chunk').map((entry) => entry.type === 'chunk' ? entry.code : '').join('\n')
    const css = outputs.filter((entry) => entry.type === 'asset' && entry.fileName.endsWith('.css')).map((entry) => entry.type === 'asset' ? String(entry.source) : '').join('\n')
    if (!js || !css) throw new Error('The standalone viewer did not build: no script or no styles.')
    return { js, css }
  })()
  return viewerBuild
}
const standaloneViewer = (): Plugin => ({
  name: 'standalone-viewer',
  resolveId(id) { return id === viewerModule ? `\0${viewerModule}` : undefined },
  async load(id) {
    if (id !== `\0${viewerModule}`) return undefined
    const { js, css } = await buildViewer()
    return `export const viewerJs = ${JSON.stringify(js)};\nexport const viewerCss = ${JSON.stringify(css)};\n`
  },
  async generateBundle() {
    const { js, css } = await buildViewer()
    this.emitFile({ type: 'asset', fileName: 'standalone-viewer.js', source: js })
    this.emitFile({ type: 'asset', fileName: 'standalone-viewer.css', source: css })
  },
})

export default defineConfig({
  base: './',
  define: { __APP_BUILD__: JSON.stringify(metadata) },
  plugins: [react(), standaloneViewer(), {
    name: 'app-build-metadata',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(metadata, null, 2) }) },
    transformIndexHtml() { return [{ tag: 'meta', attrs: { name: 'app-build-id', content: metadata.buildId }, injectTo: 'head' }] },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/build-info.json') { next(); return }
        response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(metadata))
      })
    },
  }, {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() { return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy }, injectTo: 'head-prepend' }] },
  }],
})
