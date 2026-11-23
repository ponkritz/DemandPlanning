import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

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
// attributes stay allowed (React style props). Not added to the dev server (its hot reload injects inline scripts).
export const contentSecurityPolicy = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' 'unsafe-inline' file:",
  "img-src 'self' data: blob: https: file:",
  "font-src 'self' data: file:",
  "connect-src 'self' https: file:",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

export default defineConfig({
  base: './',
  define: { __APP_BUILD__: JSON.stringify(metadata) },
  plugins: [react(), {
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
