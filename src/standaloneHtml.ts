import { cellSortValue, displayText, lastUpdate, rowId, withoutHidden, type OnDemandPage } from './onDemand.ts'
import { oneLine, safeName } from './printExport.ts'

// OND-73…OND-80 Publish standalone HTML…: one self-contained, offline .html file of a table page — who published it and
// when, the filters of the charts, the Insights charts as inline SVG and the full table of rows (hidden rows left out)
// with a small inline script to sort and search. Everything that comes from data is HTML-escaped here; the charts' SVG
// (drawn by the app) is checked against a short list of elements and attributes; a Content-Security-Policy in the file
// blocks every network request and allows only its own script (by hash). Nothing here touches the DOM or the network.

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

// A chart as taken from the app: its SVG (cleaned), a KPI's number, a summary table, or a line of text; legend entries
// with their colour (a CSS colour the browser computed: rgb()/rgba()/#hex only).
export interface CapturedChart { id: string; title: string; width: 'third' | 'half' | 'twothirds' | 'full'; kind: 'svg' | 'card' | 'table' | 'text'; svg?: string; value?: string; caption?: string; table?: string[][]; text?: string; legend?: { label: string; color: string }[]; note?: string }
export interface PublishInput { pageName: string; description: string; publishedBy: string; publishedAt: string; filtersLine: string; charts: CapturedChart[]; table: PublishTable }
export interface PublishCell { text: string; sort?: string }
export interface PublishTable { header: string[]; rows: PublishCell[][]; hidden: number }

// The rows table: every row that is not hidden (OND-39), its ID, key, every column (a Currency as "1,200.00 EUR", sorted
// by its amount), Added by / on and Last updated by / on (UTC), as the export (OND-03).
export function publishTable(input: OnDemandPage): PublishTable {
  const page = withoutHidden(input)
  const header = ['ID', 'Key', ...page.columns.map((column) => column.name), 'Added by', 'Added on (UTC)', 'Last updated by', 'Last updated on (UTC)']
  const rows = page.rows.map((row): PublishCell[] => {
    const last = lastUpdate(row)
    return [
      { text: rowId(page, row), sort: row.seq ? String(row.seq) : undefined }, { text: row.key ?? '' },
      ...page.columns.map((column): PublishCell => { const sort = cellSortValue(column, row.cells[column.id]); return { text: displayText(column, row.cells[column.id]), sort: typeof sort === 'number' ? String(sort) : undefined } }),
      { text: row.addedBy ?? '' }, { text: row.addedAt ?? '' }, { text: last?.by ?? '' }, { text: last?.at ?? '' },
    ]
  })
  return { header, rows, hidden: input.rows.length - page.rows.length }
}

// The SVG of a chart, kept only when it holds nothing but drawing: the listed elements and attributes, no event
// handler, no link and no url() other than url(#…), no escape (a backslash, &#) in an attribute, no comment, CDATA or processing
// instruction. The namespace declarations are dropped (inline SVG in HTML needs none). Anything else: null (the chart is left out).
const svgElements = new Set(['svg', 'g', 'rect', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'text', 'tspan', 'title', 'desc', 'defs', 'clippath', 'lineargradient', 'stop', 'marker'])
const svgAttributes = /^(?:class|id|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|dx|dy|d|points|width|height|viewbox|transform|fill|stroke|stroke-width|stroke-dasharray|stroke-linecap|stroke-linejoin|stroke-opacity|fill-opacity|opacity|font-size|font-family|font-weight|font-style|text-anchor|dominant-baseline|style|role|aria-[a-z]+|tabindex|clip-path|offset|stop-color|stop-opacity|gradientunits|gradienttransform|x-offset|preserveaspectratio|marker-end|marker-start|markerwidth|markerheight|refx|refy|orient|vector-effect|paint-order|letter-spacing|text-decoration|visibility|display|shape-rendering|fill-rule|clip-rule|stroke-miterlimit|stroke-dashoffset|text-rendering|alignment-baseline|baseline-shift|data-[a-z-]+)$/
export function sanitizeSvg(markup: string): string | null {
  const text = markup.replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '')
  if (!/^<svg[\s>]/i.test(text.trim()) || /<!|<\?/.test(text)) return null
  for (const match of text.matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*)>/g)) {
    if (!svgElements.has(match[1].toLowerCase())) return null
    for (const attribute of match[2].matchAll(/([^\s=/]+)(?:\s*=\s*"([^"]*)")?/g)) {
      const name = attribute[1].toLowerCase(), value = (attribute[2] ?? '').toLowerCase()
      if (!svgAttributes.test(name)) return null
      if (/javascript:|expression\(|@import|url\((?!#)|https?:|\/\/|\\|&#/.test(value)) return null
    }
  }
  return text
}
const safeColor = (color: string) => /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(color.trim()) ? color.trim() : '#888'

// The inline script: sort by a column (numbers by data-sort, else the text) and search all columns, with the count.
export const publishScript = `(function(){var t=document.getElementById('rows');if(!t)return;var b=t.tBodies[0],all=[].slice.call(b.rows),q=document.getElementById('q'),c=document.getElementById('count'),col=-1,dir=1;function key(r,i){var s=r.cells[i].getAttribute('data-sort');return s!==null&&s!==''&&!isNaN(+s)?[0,+s]:[1,r.cells[i].textContent.toLowerCase()]}function show(){var v=q.value.toLowerCase(),n=0;all.forEach(function(r){var on=!v||r.textContent.toLowerCase().indexOf(v)>=0;r.hidden=!on;if(on)n++});c.textContent=n+' of '+all.length+' rows'}[].forEach.call(t.tHead.rows[0].cells,function(th,i){th.querySelector('button').addEventListener('click',function(){dir=col===i?-dir:1;col=i;all.sort(function(a,z){var x=key(a,i),y=key(z,i);return (x[0]-y[0]||(x[1]<y[1]?-1:x[1]>y[1]?1:0))*dir});all.forEach(function(r){b.appendChild(r)});[].forEach.call(t.tHead.rows[0].cells,function(o){o.removeAttribute('aria-sort')});th.setAttribute('aria-sort',dir>0?'ascending':'descending')})});q.addEventListener('input',show);show()})();`
// The script's hash for the file's Content-Security-Policy (base64 SHA-256).
export async function scriptHash(script = publishScript) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script)))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary)
}
// No request of any kind leaves the file: nothing but its own styles, its own script (by hash) and data: images.
export const publishCsp = (hash: string) => `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
export const publishFileName = (pageName: string) => `${safeName(pageName)}.html`

const styles = `:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1b1f24;background:#f4f6f8}body{margin:0;padding:24px}main{max-width:1180px;margin:0 auto}header{margin-bottom:16px}h1{margin:0 0 4px;font-size:24px}h2{margin:0 0 8px;font-size:15px}.muted{color:#59636e;margin:2px 0}.warn{background:#fff4e5;border:1px solid #f0c36d;border-radius:8px;padding:8px 12px}.cards{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.card,figure{background:#fff;border:1px solid #dde3ea;border-radius:10px;padding:12px 14px;margin:0}.card{min-width:180px}.card strong{display:block;font-size:26px;margin:4px 0}.charts{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:12px 0 20px}figure{grid-column:span 3;min-width:0;overflow:auto}figure.third{grid-column:span 2}figure.twothirds{grid-column:span 4}figure.full{grid-column:span 6}@media(max-width:800px){figure,figure.third,figure.twothirds{grid-column:span 6}}figure svg{max-width:100%;height:auto}.legend{list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;padding:0;margin:0 0 6px;font-size:12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}th,td{border-bottom:1px solid #e4e8ed;padding:6px 8px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#eef2f6}th button{all:unset;cursor:pointer;font-weight:600}th button:focus-visible{outline:2px solid #2a78d6}th[aria-sort=ascending] button::after{content:" ▲"}th[aria-sort=descending] button::after{content:" ▼"}td.num{text-align:right;white-space:nowrap}.tools{display:flex;gap:12px;align-items:center;margin:8px 0}input[type=search]{padding:6px 10px;border:1px solid #c5ced8;border-radius:6px;min-width:260px;font:inherit}.wrap{overflow:auto;max-height:80vh;border:1px solid #dde3ea;border-radius:10px}`

function chartHtml(chart: CapturedChart) {
  const legend = chart.legend?.length ? `<ul class="legend">${chart.legend.map((entry) => `<li><i style="background:${safeColor(entry.color)}"></i>${escapeHtml(entry.label)}</li>`).join('')}</ul>` : ''
  const note = chart.note ? `<p class="muted">${escapeHtml(chart.note)}</p>` : ''
  if (chart.kind === 'card') return `<div class="card"><div class="muted">${escapeHtml(chart.title)}</div><strong>${escapeHtml(chart.value ?? '—')}</strong><div class="muted">${escapeHtml(chart.caption ?? '')}</div></div>`
  const svg = chart.kind === 'svg' && chart.svg ? sanitizeSvg(chart.svg) : null
  const body = svg ?? (chart.kind === 'table' && chart.table?.length ? `<table>${chart.table.map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>` : `<p class="muted">${escapeHtml(chart.text || 'This chart could not be included.')}</p>`)
  return `<figure class="${chart.width}"><h2>${escapeHtml(chart.title)}</h2>${note}${svg ? legend : ''}${body}</figure>`
}

// The whole file. hash: scriptHash() of publishScript.
export function buildStandaloneHtml(input: PublishInput, hash: string) {
  const cards = input.charts.filter((chart) => chart.kind === 'card'), charts = input.charts.filter((chart) => chart.kind !== 'card')
  const { header, rows, hidden } = input.table
  const numeric = header.map((_, index) => rows.some((row) => row[index]?.sort != null) && index > 0)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${publishCsp(hash)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(oneLine(input.pageName))}</title>
<style>${styles}</style>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(input.pageName)}</h1>
${input.description ? `<p class="muted">${escapeHtml(input.description)}</p>\n` : ''}<p>Published by ${escapeHtml(input.publishedBy || 'unknown')} on ${escapeHtml(input.publishedAt)}</p>
<p class="muted">A copy of the page as it was then; it does not change. It holds every row of ${escapeHtml(input.pageName)}${hidden ? ` (${hidden} hidden row${hidden === 1 ? '' : 's'} left out)` : ''}.</p>
${input.filtersLine ? `<p class="muted">Charts: ${escapeHtml(input.filtersLine)}</p>\n` : ''}</header>
${cards.length ? `<section class="cards" aria-label="Key figures">${cards.map(chartHtml).join('')}</section>\n` : ''}${charts.length ? `<section class="charts" aria-label="Charts">${charts.map(chartHtml).join('')}</section>\n` : ''}<section aria-label="Rows">
<div class="tools"><input id="q" type="search" placeholder="Search all columns" aria-label="Search all columns"><span id="count" class="muted" role="status">${rows.length} of ${rows.length} rows</span></div>
<div class="wrap"><table id="rows">
<thead><tr>${header.map((name) => `<th scope="col"><button type="button">${escapeHtml(name)}</button></th>`).join('')}</tr></thead>
<tbody>
${rows.map((row) => `<tr>${row.map((cell, index) => `<td${numeric[index] ? ' class="num"' : ''}${cell.sort != null ? ` data-sort="${escapeHtml(cell.sort)}"` : ''}>${escapeHtml(cell.text)}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table></div>
</section>
</main>
<script>${publishScript}</script>
</body>
</html>
`
}
