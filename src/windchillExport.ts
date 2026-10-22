// Windchill exports: a search run in Windchill and exported to a file (CSV, or tab-separated text), imported under
// Release Details. The columns are taken from the file's header row as they are; each export is kept like a Windchill
// view's results and, with Git storage connected, saved to Git for the other app.
export interface WindchillExport { columns: string[]; rows: Record<string, string>[] }

// Rows and cells of delimited text: quoted cells may hold the delimiter, line breaks and doubled quotes.
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// The delimiter used most outside quotes in the first lines: comma, semicolon or tab.
function delimiterOf(text: string) {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 20).join('\n').replace(/"[^"]*"/g, '')
  return [',', ';', '\t'].map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 })).sort((a, b) => b.count - a.count)[0].delimiter
}

export function parseWindchillExport(input: string): WindchillExport {
  const text = input.replace(/^﻿/, '')
  if (text.startsWith('PK')) throw new Error('This is an Excel file. Export the Windchill list as CSV (or save the Excel file as CSV) and import that.')
  if (/^\s*</.test(text)) throw new Error('This is a web page (HTML), not a CSV export. Export the Windchill list as CSV and import that.')
  const table = parseDelimited(text, delimiterOf(text)).filter((row) => row.some((cell) => cell.trim()))
  // The header is the first row as wide as most rows (Windchill may put a title line above it).
  const widths = new Map<number, number>()
  for (const row of table) if (row.length > 1) widths.set(row.length, (widths.get(row.length) ?? 0) + 1)
  const width = [...widths.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
  const start = table.findIndex((row) => row.length === width && row.filter((cell) => cell.trim()).length > 1)
  if (start < 0) throw new Error('No header row found. Import the CSV file exported from the Windchill search results.')
  const seen = new Map<string, number>()
  const columns = table[start].map((cell, index) => {
    const name = cell.trim() || `Column ${index + 1}`, count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count > 1 ? `${name} (${count})` : name
  })
  const rows = table.slice(start + 1).map((row) => Object.fromEntries(columns.map((column, index) => [column, (row[index] ?? '').trim()])))
  if (!rows.length) throw new Error('The export has a header row but no results.')
  if (rows.length > 20000) throw new Error('The export has more than 20,000 results. Narrow the Windchill search.')
  return { columns, rows }
}
