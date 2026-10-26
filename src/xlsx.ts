// A small Excel (.xlsx) reader and writer, without a library: an .xlsx file is a zip of XML parts. Reading takes every
// sheet's cells as text — shared and inline strings, numbers, booleans, and dates (cells whose number format is a date
// become YYYY-MM-DD, with the time when it has one). Writing makes a plain workbook of text cells, one sheet per table.
// Also reads CSV (comma, semicolon or tab separated). Old binary .xls files are not supported.

export interface WorkbookSheet { name: string; rows: string[][] }

// ---- zip ----
const u16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8)
const u32 = (bytes: Uint8Array, at: number) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  let end = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) if (u32(bytes, at) === 0x06054b50) { end = at; break }
  if (end < 0) throw new Error('This is not an Excel (.xlsx) file. Save it as .xlsx (Excel Workbook) or CSV and upload it again.')
  const count = u16(bytes, end + 10)
  let at = u32(bytes, end + 16)
  const files = new Map<string, Uint8Array>()
  for (let index = 0; index < count; index++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('The Excel file is damaged (zip directory).')
    const method = u16(bytes, at + 10), size = u32(bytes, at + 20), nameLength = u16(bytes, at + 28), extra = u16(bytes, at + 30), comment = u16(bytes, at + 32), local = u32(bytes, at + 42)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extra + comment
    if (u32(bytes, local) !== 0x04034b50) throw new Error('The Excel file is damaged (zip entry).')
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    const data = bytes.subarray(start, start + size)
    if (method === 0) files.set(name, data)
    else if (method === 8) files.set(name, await inflateRaw(data))
  }
  return files
}

const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 } return table })()
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0 }

// A zip with stored (uncompressed) entries: valid for Excel and simple to write.
export function zip(files: [string, string][]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name), data = encoder.encode(text), crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length), view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(8, 0, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    const entry = new Uint8Array(46 + nameBytes.length), entryView = new DataView(entry.buffer)
    entryView.setUint32(0, 0x02014b50, true); entryView.setUint16(4, 20, true); entryView.setUint16(6, 20, true); entryView.setUint32(16, crc, true); entryView.setUint32(20, data.length, true); entryView.setUint32(24, data.length, true); entryView.setUint16(28, nameBytes.length, true); entryView.setUint32(42, offset, true)
    entry.set(nameBytes, 46)
    parts.push(local, data); central.push(entry)
    offset += local.length + data.length
  }
  const size = central.reduce((sum, entry) => sum + entry.length, 0)
  const end = new Uint8Array(22), endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, size, true); endView.setUint32(16, offset, true)
  const out = new Uint8Array(offset + size + 22)
  let at = 0
  for (const part of [...parts, ...central, end]) { out.set(part, at); at += part.length }
  return out
}

// ---- XML (the few shapes an .xlsx uses) ----
const unescapeXml = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) => {
  const lower = code.toLowerCase()
  if (lower === 'amp') return '&'; if (lower === 'lt') return '<'; if (lower === 'gt') return '>'; if (lower === 'quot') return '"'; if (lower === 'apos') return "'"
  const value = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10)
  return Number.isFinite(value) ? String.fromCodePoint(value) : ''
})
const escapeXml = (text: string) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!).split('').filter((char) => { const code = char.charCodeAt(0); return code >= 32 || code === 9 || code === 10 || code === 13 }).join('')
function attributes(tag: string) {
  const found: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) found[match[1]] = unescapeXml(match[3] ?? match[4] ?? '')
  return found
}
const local = (name: string) => name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)].map((match) => unescapeXml(match[1] ?? '')).join('')

// ---- reading ----
const builtInDates = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])
function dateStyles(styles: string | undefined) {
  if (!styles) return new Set<number>()
  const custom = new Map<number, string>()
  for (const match of styles.matchAll(/<(?:\w+:)?numFmt\b[^>]*>/g)) { const attrs = attributes(match[0]); custom.set(Number(attrs.numFmtId), attrs.formatCode ?? '') }
  const isDate = (id: number) => builtInDates.has(id) || (custom.has(id) && /[dmyhs]/i.test(custom.get(id)!.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(custom.get(id)!))
  const cellXfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(styles)?.[1] ?? ''
  const dates = new Set<number>()
  ;[...cellXfs.matchAll(/<(?:\w+:)?xf\b[^>]*>/g)].forEach((match, index) => { if (isDate(Number(attributes(match[0]).numFmtId))) dates.add(index) })
  return dates
}
const pad = (value: number) => String(value).padStart(2, '0')
export function excelDate(serial: number, date1904 = false) {
  const days = serial + (date1904 ? 1462 : 0)
  const ms = Math.round((days - 25569) * 86400000)
  const date = new Date(ms)
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  return minutes ? `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` : day
}
const numberText = (raw: string) => { const value = Number(raw); return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : raw }
const columnIndex = (ref: string) => { let index = 0; for (const char of ref.replace(/\d+$/, '').toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64); return index - 1 }

function readSheet(xml: string, shared: string[], dates: Set<number>, date1904: boolean): string[][] {
  const rows: string[][] = []
  const data = /<(?:\w+:)?sheetData\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sheetData>/.exec(xml)?.[1] ?? ''
  let nextRow = 0
  for (const row of data.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const rowAttrs = attributes(row[1]), rowIndex = rowAttrs.r ? Number(rowAttrs.r) - 1 : nextRow
    nextRow = rowIndex + 1
    const cells: string[] = []
    let nextCell = 0
    for (const cell of (row[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = attributes(cell[1]), body = cell[2] ?? ''
      const index = attrs.r ? columnIndex(attrs.r) : nextCell
      nextCell = index + 1
      const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1]
      let value = ''
      if (attrs.t === 's') value = shared[Number(raw)] ?? ''
      else if (attrs.t === 'inlineStr') value = textOf(body)
      else if (attrs.t === 'str' || attrs.t === 'e') value = unescapeXml(raw ?? '')
      else if (attrs.t === 'b') value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : ''
      else if (raw != null && raw !== '') value = attrs.s != null && dates.has(Number(attrs.s)) && Number.isFinite(Number(raw)) ? excelDate(Number(raw), date1904) : numberText(unescapeXml(raw))
      if (value !== '') { while (cells.length < index) cells.push(''); cells[index] = value }
    }
    while (rows.length < rowIndex) rows.push([])
    rows[rowIndex] = cells
  }
  return rows
}

export async function readXlsx(bytes: Uint8Array): Promise<WorkbookSheet[]> {
  const files = await unzip(bytes)
  const text = (name: string) => { const data = files.get(name) ?? files.get(name.replace(/^\//, '')); return data ? new TextDecoder().decode(data) : undefined }
  const workbook = text('xl/workbook.xml')
  if (!workbook) throw new Error('This file has no Excel workbook in it. Save it as .xlsx (Excel Workbook) or CSV and upload it again.')
  const rels = new Map<string, string>()
  for (const match of (text('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) { const attrs = attributes(match[0]); rels.set(attrs.Id, attrs.Target) }
  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) => textOf(match[1]))
  const dates = dateStyles(text('xl/styles.xml'))
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*date1904\s*=\s*"(1|true)"/i.test(workbook)
  const sheets: WorkbookSheet[] = []
  for (const match of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const attrs = attributes(match[0])
    const id = Object.entries(attrs).find(([key]) => local(key) === 'id' && key.includes(':'))?.[1] ?? ''
    const target = rels.get(id)
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = text(path)
    if (xml == null) continue
    sheets.push({ name: attrs.name || `Sheet${sheets.length + 1}`, rows: readSheet(xml, shared, dates, date1904) })
  }
  if (!sheets.length) throw new Error('No sheets were found in this Excel file.')
  return sheets
}

// ---- CSV ----
export function readCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '')
  const first = body.split(/\r?\n/, 1)[0] ?? ''
  const count = (char: string) => first.split(char).length - 1
  const delimiter = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let index = 0; index < body.length; index++) {
    const char = body[index]
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') { field += '"'; index++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && field === '') quoted = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') { if (char === '\r' && body[index + 1] === '\n') index++; row.push(field); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ---- writing ----
const columnLetter = (index: number) => { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name }
export function sheetName(name: string, used: Set<string>) {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31)
  let candidate = base, n = 2
  while (used.has(candidate.toLowerCase())) { const suffix = ` (${n++})`; candidate = base.slice(0, 31 - suffix.length) + suffix }
  used.add(candidate.toLowerCase())
  return candidate
}
export function writeXlsx(sheets: WorkbookSheet[]): Uint8Array {
  const used = new Set<string>()
  const named = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }]).map((sheet) => ({ ...sheet, name: sheetName(sheet.name, used) }))
  const sheetXml = (rows: string[][]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => value === '' ? '' : `<c r="${columnLetter(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`],
    ...named.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet.rows)]),
  ])
}
