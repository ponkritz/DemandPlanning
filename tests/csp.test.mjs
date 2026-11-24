import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('NFR-09: the built page carries a Content-Security-Policy — scripts from the app only, no plugins, no foreign forms (TC-CSP-01)', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
  const policy = Object.fromEntries([...config.matchAll(/^\s+"([a-z-]+) ([^"]*)",?$/gm)].map((m) => [m[1], m[2]]))
  assert.equal(policy['script-src'], "'self' file:", 'no inline or foreign scripts')
  assert.equal(policy['object-src'], "'none'")
  assert.equal(policy['form-action'], "'none'")
  assert.equal(policy['base-uri'], "'self'")
  assert.equal(policy['frame-src'], "'none'", 'nothing may be framed (the Microsoft sign-in for SharePoint is in the backlog)')
  assert.equal(policy['media-src'], "'self' file:", 'DOC-15: video only from the app\'s own files (the user guide\'s clips)')
  assert.match(policy['connect-src'], /https:/, 'requests to https hosts only (Azure DevOps, on-premises servers, GitHub, Graph)')
  assert.doesNotMatch(Object.values(policy).join(' '), /unsafe-eval|\*/, 'no eval, no wildcard host')
  assert.match(config, /name: 'content-security-policy',\s*apply: 'build',[\s\S]*?'http-equiv': 'Content-Security-Policy'[\s\S]*?injectTo: 'head-prepend'/, 'added to the built page, before its scripts')
})
