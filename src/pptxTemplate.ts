import { unzip, zipBytes } from './xlsx.ts'

// The Monthly pack exported in the team's own PowerPoint template (PCK-08). The template is uploaded in Settings →
// Monthly pack and kept only in the private data repository (Storage), never in the app's source: it carries the
// company's branding and a confidentiality marking. The export copies the template file as it is — masters, layouts,
// theme, fonts, pictures, icons and footer — and changes only the text of the boxes it fills, so the design stays the
// template's. Page 1 is the Performance Pulse (Summary), page 2 the 2x2, in the template's order.
//
// The boxes are found by their labels and positions, not by internal shape ids, so a template saved again in
// PowerPoint still works: the text under SUMMARY, under "Demonstrated value" and "Key next steps", under LEADERSHIP
// SUPPORT REQUESTED, the box holding "Risks:" and "Proposed mitigation:", the two decision lines, the overall status
// (its word, symbol and circle), the KPI PULSE rows (label and value side by side), the title and the month line;
// on the 2x2 the four boxes by their titles. Text that does not fit is shrunk (PowerPoint's shrink on overflow, with
// the scale set for the text written).
export const packTemplateFile = 'monthly-pack-template.pptx'
export const maxTemplateBytes = 10 * 1024 * 1024

export type OverallStatus = 'On Track' | 'At Risk' | 'Off Track'
export const overallStatuses: OverallStatus[] = ['On Track', 'At Risk', 'Off Track']
export interface PulseFill {
  department: string
  monthLine: string
  summary: string[]
  status: string
  takeaways: string[]
  nextSteps: string[]
  decision: string[]
  risks: string[]
  mitigation: string[]
  leadership: string[]
  kpis: { label: string; value: string }[]
  twoByTwo: { deliverables: string[]; observations: string[]; focus: string[]; support: string[] }
}

// ---- XML helpers (only what the slides need) ----
// Characters XML 1.0 does not allow (control characters other than tab and line breaks) are dropped.
const escapeXml = (text: string) => [...text].filter((char) => char.charCodeAt(0) >= 32 || char === '\t' || char === '\n' || char === '\r').join('').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
const unescapeXml = (text: string) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, code: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code]!)
interface Shape { start: number; end: number; xml: string; x: number; y: number; cx: number; cy: number; text: string; paragraphs: string[] }
function shapesOf(slide: string): Shape[] {
  const list: Shape[] = []
  for (const match of slide.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const xml = match[0]
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(xml)
    const paragraphs = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p\/>/g)].map((entry) => entry[0])
    list.push({ start: match.index!, end: match.index! + xml.length, xml, x: Number(off?.[1] ?? 0), y: Number(off?.[2] ?? 0), cx: Number(off?.[3] ?? 0), cy: Number(off?.[4] ?? 0),
      text: paragraphs.map((paragraph) => [...paragraph.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((entry) => unescapeXml(entry[1])).join('')).join('\n').trim(), paragraphs })
  }
  return list
}
const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
const labelled = (shapes: Shape[], label: string) => shapes.find((shape) => norm(shape.text) === norm(label))
// The text box under a label: starts at or right of the label's left edge and within its width, below it, wide enough
// to hold text (icons are narrow), not itself a label; the nearest one.
function bodyBelow(shapes: Shape[], label: Shape, labels: string[]) {
  return shapes.filter((shape) => shape !== label && /<p:txBody>/.test(shape.xml) && shape.cx >= 1_000_000 && shape.y > label.y + label.cy / 2
    && shape.x >= label.x - 50_000 && shape.x <= label.x + Math.max(label.cx, 200_000) && !labels.some((name) => norm(shape.text) === norm(name)))
    .sort((a, b) => a.y - b.y)[0]
}
const pPrOf = (paragraph: string) => /<a:pPr\b[^>]*\/>|<a:pPr\b[\s\S]*?<\/a:pPr>/.exec(paragraph)?.[0] ?? ''
const rPrOf = (paragraph: string) => /<a:rPr\b[^>]*\/>|<a:rPr\b[\s\S]*?<\/a:rPr>/.exec(paragraph)?.[0] ?? (/<a:endParaRPr\b[^>]*\/>|<a:endParaRPr\b[\s\S]*?<\/a:endParaRPr>/.exec(paragraph)?.[0] ?? '<a:rPr lang="en-US"/>').replace(/a:endParaRPr/g, 'a:rPr')
const endOf = (paragraph: string) => /<a:endParaRPr\b[^>]*\/>|<a:endParaRPr\b[\s\S]*?<\/a:endParaRPr>/.exec(paragraph)?.[0] ?? ''
// A paragraph like the pattern (its bullet / numbering, spacing and run formatting) with new text.
function paragraphLike(pattern: string, line: string, rPr = rPrOf(pattern)) {
  return line ? `<a:p>${pPrOf(pattern)}<a:r>${rPr.replace(/\s*dirty="\d"/, '')}<a:t>${escapeXml(line)}</a:t></a:r></a:p>` : `<a:p>${pPrOf(pattern)}${endOf(pattern) || rPr.replace(/a:rPr/g, 'a:endParaRPr')}</a:p>`
}
const sizeOf = (xml: string) => Number(/<a:rPr\b[^>]*\bsz="(\d+)"/.exec(xml)?.[1] ?? /\bsz="(\d+)"/.exec(xml)?.[1] ?? 1000)
// Shrink on overflow: the scale PowerPoint would use for this text (estimated from the box size, the font size and the
// text length), so the slide opens with all text inside the box.
export function fitScale(lines: string[], cx: number, cy: number, sz: number) {
  const point = 12700, size = sz / 100 * point, width = Math.max(cx - 120_000, point), height = Math.max(cy - 20_000, point)
  const rows = (scale: number) => lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length * size * scale * 0.5 / width)), 0)
  for (let scale = 1; scale >= 0.3; scale -= 0.025) if (rows(scale) * size * scale * 1.2 <= height) return Math.round(scale * 1000) / 1000
  return 0.3
}
function withAutofit(shapeXml: string, scale: number) {
  const fit = scale < 1 ? `<a:normAutofit fontScale="${Math.round(scale * 100_000)}" lnSpcReduction="${scale < 0.8 ? 20000 : 10000}"/>` : '<a:normAutofit/>'
  return shapeXml.replace(/<a:bodyPr([^>]*)\/>/, `<a:bodyPr$1>${fit}</a:bodyPr>`).replace(/(<a:bodyPr[^>]*>)([\s\S]*?)(<\/a:bodyPr>)/, (_, open: string, inner: string, close: string) => `${open}${inner.replace(/<a:(?:noAutofit|spAutoFit)\/>|<a:normAutofit[^>]*\/>/g, '')}${fit}${close}`)
}
// Replaces the paragraphs of a shape (from `keep` on) with the given ones, and sets shrink on overflow.
function setParagraphs(shape: Shape, keep: number, paragraphs: string[], lines: string[]) {
  const body = /<p:txBody>([\s\S]*)<\/p:txBody>/.exec(shape.xml)
  if (!body) return shape.xml
  const head = body[1].slice(0, body[1].indexOf(shape.paragraphs[0] ?? '</p:txBody>'))
  const kept = shape.paragraphs.slice(0, keep).join('')
  const xml = shape.xml.replace(body[0], `<p:txBody>${head}${kept}${paragraphs.join('') || paragraphLike(shape.paragraphs.at(-1) ?? '<a:p/>', '')}</p:txBody>`)
  return withAutofit(xml, fitScale(lines, shape.cx, shape.cy, sizeOf(shape.xml)))
}
// The paragraph to copy for list lines: the first one with a run after the kept ones, else the last one.
const patternOf = (shape: Shape, from = 0) => shape.paragraphs.slice(from).find((paragraph) => /<a:r>/.test(paragraph)) ?? shape.paragraphs.at(-1) ?? '<a:p/>'
const fillList = (shape: Shape, lines: string[], keep = 0) => setParagraphs(shape, keep, lines.map((line) => paragraphLike(patternOf(shape, keep), line)), lines)
// Replaces one shape's text in place (title, status word, …), keeping the first run's formatting.
const setRunText = (xml: string, find: RegExp, text: string) => xml.replace(find, `<a:t>${escapeXml(text)}</a:t>`)

const statusLook: Record<OverallStatus, { symbol: string; circle: string; text?: string }> = {
  'On Track': { symbol: '✓', circle: '0E7A11' },
  'At Risk': { symbol: '!', circle: 'E8A317', text: 'B26B00' },
  'Off Track': { symbol: '✕', circle: 'C00000', text: 'C00000' },
}

// ---- The two slides ----
const pulseLabels = ['SUMMARY', 'OVERALL STATUS', 'KEY TAKEAWAYS', 'Demonstrated value', 'Key next steps', 'DECISION REQUIRED', 'RISKS', 'LEADERSHIP SUPPORT REQUESTED', 'KPI PULSE']
export function fillPulseSlide(slide: string, fill: PulseFill): { xml: string; missing: string[] } {
  const shapes = shapesOf(slide)
  const changes = new Map<Shape, string>()
  const missing: string[] = []
  const change = (shape: Shape | undefined, what: string, make: (shape: Shape) => string) => { if (shape) changes.set(shape, make(shape)); else missing.push(what) }
  // Title "<Department>| Performance Pulse update" and the month line "<Month YYYY> Update".
  const title = shapes.find((shape) => /performance pulse update/i.test(shape.text))
  change(title, 'title', (shape) => shape.xml
    .replace(/<a:t>([^<]*)\|([^<]*Performance Pulse update[^<]*)<\/a:t>/i, (all, _before: string, after: string) => fill.department.trim() ? `<a:t>${escapeXml(fill.department.trim())}|${after}</a:t>` : all)
    .replace(/<a:t>[A-Z][a-z]+ \d{4} Update<\/a:t>/, `<a:t>${escapeXml(fill.monthLine)}</a:t>`))
  const body = (label: string, what: string, lines: string[]) => { const found = labelled(shapes, label); change(found && bodyBelow(shapes, found, pulseLabels), what, (shape) => fillList(shape, lines)) }
  body('SUMMARY', 'Summary', fill.summary)
  body('Demonstrated value', 'Key takeaways', fill.takeaways)
  body('Key next steps', 'Key next steps', fill.nextSteps)
  body('LEADERSHIP SUPPORT REQUESTED', 'Leadership support requested', fill.leadership)
  // Risks: the "Risks:" heading, its bullets, the "Proposed mitigation:" heading and its bullets, as in the template.
  const risks = shapes.find((shape) => /^risks:/im.test(shape.text) && /proposed mitigation:/i.test(shape.text))
  change(risks, 'Risks', (shape) => {
    const heading = shape.paragraphs.find((paragraph) => /<a:t>\s*Risks:\s*<\/a:t>/.test(paragraph)) ?? shape.paragraphs[0]
    const mitigation = shape.paragraphs.find((paragraph) => /Proposed mitigation:/.test(paragraph)) ?? heading
    const bullet = shape.paragraphs.find((paragraph) => /<a:buChar\b/.test(paragraph) && /<a:r>/.test(paragraph)) ?? heading
    const list = (lines: string[]) => (lines.length ? lines : ['']).map((line) => paragraphLike(bullet, line))
    return setParagraphs(shape, 0, [heading, ...list(fill.risks), mitigation, ...list(fill.mitigation)], ['Risks:', ...fill.risks, 'Proposed mitigation:', ...fill.mitigation])
  })
  // Decision required: the first line in the bracketed headline, the rest in the line below it.
  const headline = shapes.find((shape) => /^\[[^\]]*\]$/.test(shape.text.replace(/\s+/g, ' ')))
  const detail = shapes.find((shape) => norm(shape.text) === 'placeholder')
  change(headline, 'Decision required', (shape) => fillList(shape, fill.decision.slice(0, 1)))
  change(detail, 'Decision required (detail)', (shape) => fillList(shape, fill.decision.slice(1)))
  // Overall status: the word, the symbol in the circle, and the circle's colour.
  const word = shapes.find((shape) => overallStatuses.some((status) => norm(status) === norm(shape.text)))
  const look = statusLook[overallStatuses.find((status) => norm(status) === norm(fill.status)) ?? 'On Track']
  change(word, 'Overall status', (shape) => { const xml = setRunText(shape.xml, /<a:t>[^<]*<\/a:t>/, fill.status.trim() || 'On Track'); return look.text ? xml.replace(/<a:srgbClr val="[0-9A-F]{6}"\/>/gi, `<a:srgbClr val="${look.text}"/>`) : xml })
  const symbol = shapes.find((shape) => /^[✓✔!✕✖×]$/.test(shape.text))
  change(symbol, 'Overall status symbol', (shape) => setRunText(shape.xml, /<a:t>[^<]*<\/a:t>/, look.symbol))
  const circle = symbol && shapes.find((shape) => /prst="ellipse"/.test(shape.xml) && Math.abs(shape.x - symbol.x) < 50_000 && Math.abs(shape.y - symbol.y) < 50_000)
  if (circle) changes.set(circle, circle.xml.replace(/(<p:spPr>[\s\S]*?<a:solidFill>)<a:srgbClr val="[0-9A-F]{6}"\/>/i, `$1<a:srgbClr val="${look.circle}"/>`))
  // KPI PULSE: the rows under the label, a name on the left and its value on the right, filled in order.
  const kpi = shapes.find((shape) => norm(shape.text) === 'kpi pulse')
  if (!kpi) missing.push('KPI Pulse')
  else {
    // The rows stop at the bottom of the KPI box (the frame under the label), so the footer below is never taken.
    const frame = shapes.filter((shape) => shape !== kpi && shape.cx >= kpi.cx * 0.9 && shape.y <= kpi.y + kpi.cy && shape.y + shape.cy > kpi.y + kpi.cy).sort((a, b) => b.cy - a.cy)[0]
    const bottom = frame ? frame.y + frame.cy : kpi.y + 1_300_000
    const inside = shapes.filter((shape) => shape !== kpi && /<p:txBody>/.test(shape.xml) && /<a:r>|<a:endParaRPr/.test(shape.xml) && shape.y > kpi.y + kpi.cy / 2 && shape.y + shape.cy / 2 < bottom && shape.x >= kpi.x - 50_000 && shape.x < kpi.x + kpi.cx && shape.cx < kpi.cx * 0.8 && shape.cy < 400_000)
    const split = kpi.x + kpi.cx * 0.55
    const names = inside.filter((shape) => shape.x < split).sort((a, b) => a.y - b.y)
    const values = inside.filter((shape) => shape.x >= split)
    names.forEach((name, index) => {
      const row = fill.kpis[index]
      changes.set(name, setRunText(name.xml, /<a:t>[^<]*<\/a:t>/, row?.label ?? ''))
      const near = values.filter((value) => Math.abs(value.y - name.y) < 90_000).sort((a, b) => Number(Boolean(b.text)) - Number(Boolean(a.text)) || Math.abs(a.y - name.y) - Math.abs(b.y - name.y))
      near.forEach((value, at) => changes.set(value, at === 0 ? (/<a:t>/.test(value.xml) ? setRunText(value.xml, /<a:t>[^<]*<\/a:t>/, row?.value ?? '') : fillList(value, [row?.value ?? ''])) : value.xml.replace(/<a:t>[^<]*<\/a:t>/g, '<a:t></a:t>')))
    })
    if (fill.kpis.length > names.length) missing.push(`KPI rows beyond the template's ${names.length}`)
  }
  let xml = slide
  for (const [shape, next] of [...changes.entries()].sort((a, b) => b[0].start - a[0].start)) xml = xml.slice(0, shape.start) + next + xml.slice(shape.end)
  return { xml, missing }
}

export function fillTwoByTwoSlide(slide: string, fill: PulseFill['twoByTwo']): { xml: string; missing: string[] } {
  const shapes = shapesOf(slide)
  const boxes: [string, string[]][] = [['Actions/Deliverables Realized', fill.deliverables], ['Observations, Challenges & Risks', fill.observations], ['Focus Areas for Next Months', fill.focus], ['Support Requested / Topics to Highlight', fill.support]]
  const missing: string[] = []
  let xml = slide
  const changes: [Shape, string][] = []
  const found = boxes.map(([title, lines]) => ({ title, lines, shape: shapes.find((entry) => norm(entry.text.split('\n')[0]) === norm(title)) }))
  // One look for the lines of all four boxes: the template's bulleted line (the boxes differ in the template), in the
  // titles' colour at 10 pt and the theme's body font; the title stays each box's first paragraph.
  const bulleted = found.flatMap((entry) => entry.shape?.paragraphs.slice(1) ?? []).find((paragraph) => /<a:buChar\b/.test(paragraph))
  const pattern = bulleted ?? '<a:p><a:pPr marL="171450" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr></a:p>'
  for (const { title, lines, shape } of found) {
    if (!shape) { missing.push(title); continue }
    const colour = /<a:srgbClr val="([0-9A-F]{6})"\/>/i.exec(rPrOf(shape.paragraphs[0]))?.[1] ?? '002060'
    const rPr = `<a:rPr lang="en-US" sz="1000" b="0"><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></a:rPr>`
    changes.push([shape, setParagraphs(shape, 1, lines.map((line) => paragraphLike(pattern, line, rPr)), [title, ...lines])])
  }
  for (const [shape, next] of changes.sort((a, b) => b[0].start - a[0].start)) xml = xml.slice(0, shape.start) + next + xml.slice(shape.end)
  return { xml, missing }
}

// ---- The file ----
async function slidesOf(files: Map<string, Uint8Array>) {
  const decoder = new TextDecoder()
  const presentation = decoder.decode(files.get('ppt/presentation.xml') ?? new Uint8Array())
  const rels = decoder.decode(files.get('ppt/_rels/presentation.xml.rels') ?? new Uint8Array())
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((match) => [/Id="([^"]+)"/.exec(match[0])?.[1] ?? '', /Target="([^"]+)"/.exec(match[0])?.[1] ?? '']))
  return [...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((match) => `ppt/${(targets.get(match[1]) ?? '').replace(/^\/?ppt\//, '')}`).filter((path) => files.has(path))
}
// Checks an uploaded template: a PowerPoint file with a Performance Pulse slide and a 2x2 slide this export can fill.
export async function checkTemplate(bytes: Uint8Array): Promise<{ problems: string[]; warnings: string[] }> {
  if (bytes.length > maxTemplateBytes) return { problems: [`The template is larger than ${maxTemplateBytes / 1024 / 1024} MB.`], warnings: [] }
  let files: Map<string, Uint8Array>
  try { files = await unzip(bytes) } catch { return { problems: ['This is not a PowerPoint (.pptx) file.'], warnings: [] } }
  if (!files.has('ppt/presentation.xml')) return { problems: ['This is not a PowerPoint (.pptx) file.'], warnings: [] }
  const decoder = new TextDecoder()
  const slides = (await slidesOf(files)).map((path) => decoder.decode(files.get(path)!))
  const pulse = slides.find((slide) => /KPI PULSE/i.test(slide)), grid = slides.find((slide) => /Actions\/Deliverables Realized/i.test(slide))
  const problems = [...(pulse ? [] : ['No Performance Pulse slide (with KPI PULSE) was found.']), ...(grid ? [] : ['No 2x2 slide (with "Actions/Deliverables Realized") was found.'])]
  const empty: PulseFill = { department: '', monthLine: '', summary: [], status: 'On Track', takeaways: [], nextSteps: [], decision: [], risks: [], mitigation: [], leadership: [], kpis: [], twoByTwo: { deliverables: [], observations: [], focus: [], support: [] } }
  const warnings = [...(pulse ? fillPulseSlide(pulse, empty).missing.filter((entry) => !entry.startsWith('KPI rows')) : []), ...(grid ? fillTwoByTwoSlide(grid, empty.twoByTwo).missing : [])]
  return { problems, warnings: warnings.map((entry) => `Not found in the template: ${entry}.`) }
}
// The template with the pack's text: every other part of the file is kept as it is. The file properties name nobody.
export async function fillTemplate(bytes: Uint8Array, fill: PulseFill, now = new Date()): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const files = await unzip(bytes)
  const decoder = new TextDecoder(), encoder = new TextEncoder()
  const missing: string[] = []
  for (const path of await slidesOf(files)) {
    const slide = decoder.decode(files.get(path)!)
    if (/KPI PULSE/i.test(slide)) { const done = fillPulseSlide(slide, fill); files.set(path, encoder.encode(done.xml)); missing.push(...done.missing) }
    else if (/Actions\/Deliverables Realized/i.test(slide)) { const done = fillTwoByTwoSlide(slide, fill.twoByTwo); files.set(path, encoder.encode(done.xml)); missing.push(...done.missing) }
  }
  const core = files.get('docProps/core.xml')
  if (core) files.set('docProps/core.xml', encoder.encode(decoder.decode(core).replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>').replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>').replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${now.toISOString().replace(/\.\d+Z$/, 'Z')}$2`)))
  // [Content_Types].xml first, as PowerPoint writes it.
  const entries = [...files.entries()].sort(([a], [b]) => Number(b === '[Content_Types].xml') - Number(a === '[Content_Types].xml'))
  return { bytes: zipBytes(entries), missing }
}
