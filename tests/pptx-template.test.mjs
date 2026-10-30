import test from 'node:test'
import assert from 'node:assert/strict'
import { checkTemplate, fillTemplate, fitScale } from '../src/pptxTemplate.ts'
import { unzip, zip } from '../src/xlsx.ts'
import { buildMonthlyPack, defaultPackSetup, emptyNotes, packFill, parsePackSetup, serializePackSetup } from '../src/monthlyPack.ts'

// A synthetic template shaped like the team's (labels, boxes and positions; no company content): the real template is
// kept only in the private Storage repository, never in this source repository.
let id = 1
const run = (text, extra = '') => `<a:r><a:rPr lang="en-US" sz="800"${extra}><a:solidFill><a:srgbClr val="050A5F"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r>`
const para = (content, pPr = '<a:pPr marL="0" indent="0"><a:buNone/></a:pPr>') => `<a:p>${pPr}${content}</a:p>`
const bullet = '<a:pPr marL="171450" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>'
const shape = (x, y, cx, cy, paragraphs, geometry = 'rect', fill = '') => `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill}</p:spPr><p:txBody><a:bodyPr wrap="square"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs.join('')}</p:txBody></p:sp>`
const text = (x, y, cx, cy, ...lines) => shape(x, y, cx, cy, lines.map((line) => para(run(line))))
const slide = (shapes) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`
function template() {
  const pulse = slide([
    shape(232321, 61722, 8138160, 719137, [para(run('Department name| Performance Pulse update')), para(run('September 2026 Update'))]),
    text(1275588, 768096, 891540, 137160, 'SUMMARY'), text(1275588, 980365, 5291275, 376484, 'Actual utilization eased to 107.5% in August.'),
    text(7334351, 774954, 891540, 137160, 'OVERALL STATUS'),
    shape(7224623, 980694, 274320, 274320, [para('<a:endParaRPr lang="en-US"/>')], 'ellipse', '<a:solidFill><a:srgbClr val="0E7A11"/></a:solidFill>'),
    text(7224623, 987552, 274320, 260604, '✓'), text(7608671, 980530, 1159818, 267953, 'On Track'),
    text(192023, 1487837, 4293109, 240030, 'KEY TAKEAWAYS'), text(891540, 1765548, 1645920, 157734, 'Demonstrated value'), shape(891539, 1938442, 3283567, 1032313, [para('<a:endParaRPr lang="en-US" sz="800"/>', bullet)]),
    text(891540, 2970756, 1851660, 157734, 'Key next steps'), shape(891539, 3116018, 3503998, 322326, [para(run('X'), bullet), para(run('x'), bullet)]),
    text(3305556, 1474470, 2523744, 240030, 'DECISION REQUIRED'), text(3639749, 2365210, 1869704, 438913, '[Decision to be made]'), text(3803077, 3024986, 1543049, 342900, 'PlaceHolder'),
    text(6752922, 1484755, 2116758, 235029, 'RISKS'),
    shape(6818450, 2037273, 2016939, 1215021, [para(run('Risks:', ' b="1"')), para(run('X'), bullet), para(run('X'), bullet), para(run('Proposed mitigation:', ' b="1"')), para(run('x'), bullet)]),
    text(192024, 3548420, 4297680, 219456, 'LEADERSHIP SUPPORT REQUESTED'), text(342900, 3884462, 397764, 384048, ''), shape(847410, 3927103, 3597102, 716661, [para(run('X'), '<a:pPr marL="180975" indent="-180975"><a:buAutoNum type="arabicPeriod"/></a:pPr>')]),
    shape(4604081, 3581127, 4297681, 1252968, [para('<a:endParaRPr lang="en-US"/>')]), text(4572000, 3548420, 4297681, 219456, ' KPI PULSE'),
    ...[['Utilization(YTD)', '107.5%'], ['TEDs Compliance', '99%'], ['KPI 3', 'Status']].flatMap(([name, value], row) => [text(4612331, 3783671 + row * 145000, 2519330, 120015, name), text(7222824, 3778163 + row * 145000, 1556057, 120015, value)]),
    text(6700000, 4846494, 2304000, 343500, 'Footer text stays'),
  ])
  const grid = slide(['Actions/Deliverables Realized', 'Observations, Challenges &amp; Risks', 'Focus Areas for Next Months', 'Support Requested / Topics to Highlight']
    .map((title, index) => shape(501035 + (index % 2) * 4070022, 767877 + Math.floor(index / 2) * 2044584, 3908620, 1883987, [para(run(title, ' sz="1000" b="1"')), para('<a:endParaRPr lang="en-US" sz="600"/>', bullet)])))
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['ppt/presentation.xml', '<p:presentation xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId2" Type="slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="slide" Target="slides/slide2.xml"/></Relationships>'],
    ['ppt/slides/slide1.xml', pulse], ['ppt/slides/slide2.xml', grid],
    ['ppt/media/logo.png', 'not really a png'],
    ['docProps/core.xml', '<cp:coreProperties><dc:creator>Someone</dc:creator><cp:lastModifiedBy>Some Person</cp:lastModifiedBy><dcterms:modified>2026-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>'],
  ])
}
const fill = {
  department: 'I&D Quality', monthLine: 'October 2026 Update', summary: ['Actual utilization was 104.5% in October 2026.'], status: 'At Risk',
  takeaways: ['YoY +60%'], nextSteps: ['Close DT'], decision: ['Approve one QE', 'Needed for PPU.'], risks: ['Overload <104.5%>'], mitigation: ['Move PPU'], leadership: ['Prioritise CP'],
  kpis: [{ label: 'Utilization (YTD)', value: '104.1%' }, { label: 'TEDs', value: '99%' }], twoByTwo: { deliverables: ['DP - DoseNav 2.1'], observations: ['Capacity: 104.5%'], focus: ['Agent governance'], support: [] },
}
const textOf = (xml) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1]).join('|')

test('Monthly pack in the team template: page 1 the Performance Pulse, page 2 the 2x2, filled in the template’s own boxes (TC-PCK-06)', async () => {
  const bytes = template()
  assert.deepEqual(await checkTemplate(bytes), { problems: [], warnings: [] })
  const out = await fillTemplate(bytes, fill, new Date('2026-11-02T10:00:00Z'))
  assert.deepEqual(out.missing, [])
  const files = await unzip(out.bytes)
  const decode = (name) => new TextDecoder().decode(files.get(name))
  const pulse = decode('ppt/slides/slide1.xml'), grid = decode('ppt/slides/slide2.xml')
  const words = textOf(pulse)
  for (const expected of ['I&amp;D Quality| Performance Pulse update', 'October 2026 Update', 'Actual utilization was 104.5% in October 2026.', 'At Risk', '!', 'YoY +60%', 'Close DT', 'Approve one QE', 'Needed for PPU.', 'Risks:', 'Overload &lt;104.5%&gt;', 'Proposed mitigation:', 'Move PPU', 'Prioritise CP', 'Utilization (YTD)|104.1%|TEDs|99%||', 'Footer text stays'])
    assert.ok(words.includes(expected), `page 1 has “${expected}”`)
  assert.ok(!/Department name|September 2026|eased to|PlaceHolder|\[Decision|KPI 3|Status|>X</.test(words), 'no template placeholder text is left')
  assert.match(pulse, /prst="ellipse"[\s\S]*?<a:srgbClr val="E8A317"\/>/, 'the status circle turns amber for At Risk')
  assert.match(textOf(grid), /Actions\/Deliverables Realized\|DP - DoseNav 2\.1\|Observations, Challenges &amp; Risks\|Capacity: 104\.5%\|Focus Areas for Next Months\|Agent governance\|Support Requested/)
  assert.match(pulse, /<a:normAutofit/, 'shrink on overflow is set on the filled boxes')
  assert.equal(decode('ppt/media/logo.png'), 'not really a png', 'every other part of the template is kept as it is')
  assert.match(decode('docProps/core.xml'), /<dc:creator><\/dc:creator><cp:lastModifiedBy><\/cp:lastModifiedBy><dcterms:modified>2026-11-02T10:00:00Z/, 'the file properties name nobody')
})

test('template checks and shrink to fit: not a .pptx, a template without the slides, and the scale for long text (TC-PCK-06)', async () => {
  assert.deepEqual((await checkTemplate(new TextEncoder().encode('hello'))).problems, ['This is not a PowerPoint (.pptx) file.'])
  const bare = zip([['ppt/presentation.xml', '<p:presentation/>'], ['ppt/_rels/presentation.xml.rels', '<Relationships/>']])
  assert.equal((await checkTemplate(bare)).problems.length, 2, 'no Performance Pulse and no 2x2 slide')
  assert.equal(fitScale(['short'], 2_000_000, 1_000_000, 800), 1, 'short text keeps its size')
  const long = Array.from({ length: 30 }, (_, index) => `Risk number ${index} with a fairly long description of what can go wrong`)
  const scale = fitScale(long, 2_000_000, 1_200_000, 800)
  assert.ok(scale < 0.7 && scale >= 0.3, `long text shrinks (${scale})`)
})

test('the pack fills the template: department from the setup, status default On Track, KPI values (TC-PCK-06)', () => {
  const setup = parsePackSetup(serializePackSetup({ ...defaultPackSetup, department: '  I&D Quality ' }))
  assert.equal(setup.department, 'I&D Quality')
  assert.equal(parsePackSetup(serializePackSetup(defaultPackSetup)).department, undefined)
  const pack = buildMonthlyPack({ month: '2026-10', setup, notes: emptyNotes('2026-10'), items: [], streamsOf: () => [], utilization: { month: 104.5, ytd: 101.2, qeMonth: null } })
  const filled = packFill(pack, setup.department)
  assert.deepEqual([filled.department, filled.monthLine, filled.status, filled.summary[0], filled.kpis[0]], ['I&D Quality', 'October 2026 Update', 'On Track', 'Actual utilization was 104.5% in October 2026.', { label: 'Utilization (YTD)', value: '101.2%' }])
})
