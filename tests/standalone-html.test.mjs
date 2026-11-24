import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, existsSync, rmSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildStandaloneHtml, escapeHtml, publishCsp, publishFileName, publishScript, publishTable, sanitizeSvg, scriptHash } from '../src/standaloneHtml.ts'
import { isDue, lastOccurrence, nextOccurrence, parsePublishKey, parseSchedules, publishKey, scheduleText } from '../src/publishSchedule.ts'
const { publishTargets } = createRequire(import.meta.url)('../electron/html-publish.cjs')

const columns = [
  { id: 'c1', name: 'Topic <b>', type: 'text', options: [], required: false },
  { id: 'c2', name: 'Cost', type: 'currency', options: [], required: false, currency: 'EUR' },
  { id: 'c3', name: 'Count', type: 'number', options: [], required: false },
]
const page = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ <script>', description: 'Cost & "quality"', keyPrefix: 'CONQ', columns, insights: [], rows: [
  { id: 'r1', seq: 1, key: 'CONQ-260101-AAA2', addedBy: 'ana@example.com', addedAt: '2026-01-02T10:00:00.000Z', cells: { c1: '<img src=x onerror=alert(1)>', c2: '1200 EUR', c3: '7' } },
  { id: 'r2', seq: 2, key: 'CONQ-260101-AAA3', cells: { c1: 'Late </script><script>alert(2)</script>', c2: '80 EUR', c3: '12' } },
  { id: 'r3', seq: 3, key: 'CONQ-260101-AAA4', hidden: { by: 'ana@example.com', at: '2026-02-01T10:00:00.000Z' }, cells: { c1: 'Secret hidden row' } },
] }
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120" role="img"><title>Cost: Scrap 1,200 &amp; more &lt;x&gt;</title><rect x="1" y="2" width="30" height="10" style="fill:rgb(42, 120, 214)"/><text x="4" y="20" style="font-size:12px;font-family:Inter, &quot;Segoe UI&quot;">Scrap</text></svg>'
const input = (extra = {}) => ({ pageName: page.name, description: page.description, publishedBy: 'Ana <Costa>', publishedAt: '24 Nov 2026, 14:32 CET', filtersLine: 'filter row — Category: Scrap', table: publishTable(page), charts: [
  { id: 'i1', title: 'Cost by "category"', width: 'half', kind: 'svg', svg, legend: [{ label: 'Sum of Cost <EUR>', color: 'rgb(42, 120, 214)' }, { label: 'Bad', color: 'url(https://evil.example/x)' }] },
  { id: 'i2', title: 'Rows', width: 'half', kind: 'card', value: '2', caption: 'Count of rows' },
], ...extra })

test('OND-74, OND-77: the file — every value escaped, no external URL, hidden rows left out, the sort and search script with its CSP hash (TC-OND-60)', async () => {
  const hash = await scriptHash()
  assert.equal(hash, createHash('sha256').update(publishScript).digest('base64'), 'the CSP hash is the script’s SHA-256')
  const html = buildStandaloneHtml(input(), hash)
  assert.match(html, /^<!doctype html>/)
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${publishCsp(hash)}">`))
  assert.match(publishCsp(hash), /^default-src 'none';.*script-src 'sha256-[A-Za-z0-9+/=]+';/)
  assert.doesNotMatch(publishCsp(hash), /unsafe-eval|https?:|\*/)
  // No request can leave the file: no http(s) or protocol-relative address anywhere (the SVG namespace dropped too).
  assert.doesNotMatch(html, /https?:|\/\/[a-z]|\s(?:src|href|action)="|<(?:img|link|iframe|object|embed|form)\b|@import|url\(/i)
  // Escaped data: no tag from a value or a name.
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(html.includes('Late &lt;/script&gt;&lt;script&gt;alert(2)&lt;/script&gt;'))
  assert.equal(html.match(/<script>/g).length, 1, 'only the app’s own script')
  assert.ok(html.includes('<title>CoNQ &lt;script&gt;</title>'))
  assert.ok(html.includes('Published by Ana &lt;Costa&gt; on 24 Nov 2026, 14:32 CET'))
  assert.ok(html.includes('Cost &amp; &quot;quality&quot;'))
  assert.ok(html.includes('<button type="button">Topic &lt;b&gt;</button>'))
  assert.ok(html.includes('Sum of Cost &lt;EUR&gt;'))
  assert.ok(html.includes('<i style="background:#888"></i>Bad'), 'a colour that is not rgb()/#hex is replaced')
  // Hidden rows are left out; the table counts them.
  assert.doesNotMatch(html, /Secret hidden row|CONQ-0003/)
  assert.ok(html.includes('(1 hidden row left out)'))
  assert.ok(html.includes('<span id="count" class="muted" role="status">2 of 2 rows</span>'))
  // Numbers and amounts sort as numbers.
  assert.ok(html.includes('<td class="num" data-sort="1200">1,200.00 EUR</td>'))
  assert.ok(html.includes('<td class="num" data-sort="7">7</td>'))
  // The chart as inline SVG, the card as text.
  assert.ok(html.includes('<svg width="300" height="120" viewBox="0 0 300 120" role="img">'))
  assert.ok(html.includes('<div class="card"><div class="muted">Rows</div><strong>2</strong>'))
  assert.ok(html.includes("getElementById('q')") && html.includes('aria-sort'), 'search and sort script present')
  assert.equal(publishFileName('CoNQ / 2026'), 'CoNQ - 2026.html')
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;')
})

test('OND-77: a chart’s SVG is kept only when it is plain drawing (TC-OND-60)', () => {
  assert.ok(sanitizeSvg(svg).startsWith('<svg width="300"'))
  for (const bad of [
    '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><a href="https://x"><text>x</text></a></svg>',
    '<svg><rect style="fill:url(https://evil.example/x)"/></svg>', '<svg><image href="x.png"/></svg>', '<svg><foreignObject><div/></foreignObject></svg>',
    '<svg><rect style="fill:u\\72l(x)"/></svg>', '<svg><rect style="&#117;rl(x)"/></svg>', '<svg><!-- x --></svg>', '<div>x</div>', '<svg><use xlink:href="#a"/></svg>',
  ]) assert.equal(sanitizeSvg(bad), null, bad)
  assert.ok(sanitizeSvg('<svg><defs><clipPath id="a"><rect/></clipPath></defs><g clip-path="url(#a)"><path d="M0 0L1 1"/></g></svg>'))
  // A chart that is not kept says so in the file.
  const html = buildStandaloneHtml(input({ charts: [{ id: 'x', title: 'Odd', width: 'full', kind: 'svg', svg: '<svg onload="x()"></svg>' }] }), 'h')
  assert.ok(html.includes('This chart could not be included.'))
  assert.doesNotMatch(html, /onload/)
})

test('OND-78, OND-79: the schedule — due times with a fake clock, a missed run once at the next start, read back strictly (TC-OND-61)', () => {
  const at = (day, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute) // November 2026, local time
  const daily = { mode: 'daily', day: 1, time: '07:30', setAt: at(20, 12).toISOString() }
  assert.deepEqual(lastOccurrence(daily, at(23, 8)), at(23, 7, 30))
  assert.deepEqual(lastOccurrence(daily, at(23, 7)), at(22, 7, 30))
  assert.deepEqual(nextOccurrence(daily, at(23, 8)), at(24, 7, 30))
  assert.equal(isDue(daily, at(20, 13)), false, 'not for a time before the schedule was set')
  assert.equal(isDue(daily, at(21, 7, 29)), false)
  assert.equal(isDue(daily, at(21, 7, 30)), true)
  assert.equal(isDue({ ...daily, lastRun: at(21, 7, 30).toISOString() }, at(21, 18)), false, 'once per occurrence')
  // The app was closed from the 21st to the 24th: one run at the next start.
  const missed = { ...daily, lastRun: at(21, 7, 31).toISOString() }
  assert.equal(isDue(missed, at(24, 9)), true)
  assert.equal(isDue({ ...missed, lastRun: at(24, 9).toISOString() }, at(24, 9, 1)), false)
  // Weekly on Monday (23 Nov 2026 is a Monday).
  const weekly = { mode: 'weekly', day: 1, time: '06:00', setAt: at(18).toISOString() }
  assert.deepEqual(lastOccurrence(weekly, at(25, 12)), at(23, 6))
  assert.deepEqual(lastOccurrence(weekly, at(23, 5)), at(16, 6))
  assert.deepEqual(nextOccurrence(weekly, at(25)), at(30, 6))
  assert.equal(isDue(weekly, at(22, 23)), false)
  assert.equal(isDue(weekly, at(23, 6)), true)
  assert.equal(isDue({ ...weekly, mode: 'off' }, at(23, 6)), false)
  assert.equal(scheduleText(weekly), 'Weekly on Monday at 06:00')
  assert.equal(scheduleText(daily), 'Daily at 07:30')
  // Read back strictly.
  const target = publishKey('acme/storage@main:access.json', 'owner@example.com', 'conq')
  const other = publishKey('acme/storage@main:access.json', 'owner@example.com', 'other')
  const third = publishKey('acme/storage@main:access.json', 'owner@example.com', 'third')
  const parsed = parseSchedules(JSON.stringify({ [target]: { ...weekly, lastOk: false, lastText: 'Folder missing' }, conq: weekly, [other]: { ...daily, time: '25:00' }, [third]: { ...daily, mode: 'hourly', day: 9 } }))
  assert.equal(publishKey('acme/storage@main:access.json', ' Owner@EXAMPLE.COM ', 'conq'), target)
  assert.deepEqual(parsePublishKey(target), { repository: 'acme/storage@main:access.json', publisher: 'owner@example.com', pageId: 'conq' })
  assert.deepEqual(Object.keys(parsed), [target, third])
  assert.equal(parsed[target].lastOk, false)
  assert.equal(parsed[third].mode, 'off')
  assert.equal(parsed[third].day, 1)
  assert.deepEqual(parseSchedules('not json'), {})
})

test('OND-76: the desktop file is chosen, scoped to the repository and publisher, and overwritten using an exclusive temporary file (TC-OND-62)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dph-publish-'))
  try {
    const choices = []
    const temporary = []
    const storeFile = join(dir, 'targets.json')
    const repository = 'acme/storage@main:access.json'
    const owner = 'owner@example.com'
    const target = publishKey(repository, owner, 'conq')
    const differentPage = publishKey(repository, owner, 'other')
    const differentOwner = publishKey(repository, 'other@example.com', 'conq')
    const differentRepository = publishKey('acme/another@main:access.json', owner, 'conq')
    await fs.writeFile(storeFile, JSON.stringify({ conq: join(dir, 'Legacy.html') }))
    const io = { ...fs, open: async (file, flags, mode) => { temporary.push({ file, flags, mode }); return fs.open(file, flags, mode) } }
    const targets = publishTargets({ storeFile, fs: io, documentsDir: join(dir, 'Documents'), showSaveDialog: async (options) => { choices.push(options.defaultPath); return { canceled: false, filePath: join(dir, 'Shared', 'CoNQ') } } })
    assert.equal(await targets.target(target), null, 'the old unscoped preference is ignored')
    await assert.rejects(targets.write(target, '<!doctype html><p>x'), /No file is chosen/)
    await fs.mkdir(join(dir, 'Shared'))
    assert.deepEqual(await targets.choose(target, 'CoNQ.html'), { path: join(dir, 'Shared', 'CoNQ.html') })
    assert.equal(choices[0], join(dir, 'Documents', 'CoNQ.html'))
    assert.deepEqual(await targets.target(target), { path: join(dir, 'Shared', 'CoNQ.html') })
    assert.deepEqual(await targets.write(target, '<!doctype html><p>one'), { path: join(dir, 'Shared', 'CoNQ.html'), bytes: 21 })
    await targets.write(target, '<!doctype html><p>two')
    assert.equal(readFileSync(join(dir, 'Shared', 'CoNQ.html'), 'utf8'), '<!doctype html><p>two', 'the same file overwritten')
    assert.equal(new Set(temporary.map((entry) => entry.file)).size, 2)
    assert.ok(temporary.every((entry) => entry.flags === 'wx' && entry.mode === 0o600 && !existsSync(entry.file)))
    // The next dialog starts at the remembered file.
    await targets.choose(target, 'CoNQ.html')
    assert.equal(choices[1], join(dir, 'Shared', 'CoNQ.html'))
    // A page id or content that is not one is refused; another page has no file.
    await assert.rejects(targets.write('../etc', '<!doctype html>'), /Invalid publishing repository, person or page/)
    await assert.rejects(targets.write(target, '<p>no doctype'), /Invalid HTML/)
    for (const unrelated of [differentPage, differentOwner, differentRepository]) {
      assert.equal(await targets.target(unrelated), null)
      await assert.rejects(targets.write(unrelated, '<!doctype html>'), /No file is chosen/)
    }
    // The folder gone: said so.
    rmSync(join(dir, 'Shared'), { recursive: true })
    await assert.rejects(targets.write(target, '<!doctype html><p>three'), /The folder .* is missing/)
    assert.equal(existsSync(join(dir, 'Shared')), false)
    // Cancelled dialog: nothing remembered.
    const cancel = publishTargets({ storeFile: join(dir, 'targets.json'), fs, documentsDir: dir, showSaveDialog: async () => ({ canceled: true }) })
    assert.equal(await cancel.choose(differentPage, 'New.html'), null)
    assert.equal(await cancel.target(differentPage), null)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
