// OND-69, OND-72: Export PDF… in the desktop app — the window's print view (print CSS of the page) printed to a PDF by
// Chromium (webContents.printToPDF: vector text and charts), with the footer "{page} · Exported {date, time, zone} ·
// Page n of m" drawn by Chromium's own footer template, then saved where the person chooses (save dialog). The request
// from the page is checked again here: a file name ending .pdf (no path), A4 or Letter, a footer of plain text.
const path = require('path')

const paperSizes = ['A4', 'Letter']
const maxFooter = 300

// Control characters are removed from the footer on purpose (SM-119).
// eslint-disable-next-line no-control-regex
const oneLine = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
const escapeHtml = (text) => oneLine(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function pdfRequest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid PDF request.')
  const fileName = oneLine(raw.fileName)
  if (!/^[^\\/:*?"<>|]{1,120}\.pdf$/i.test(fileName) || fileName.startsWith('.')) throw new Error('Invalid PDF file name.')
  if (!paperSizes.includes(raw.paper)) throw new Error('Invalid page size.')
  if (typeof raw.landscape !== 'boolean') throw new Error('Invalid orientation.')
  const footer = oneLine(raw.footer)
  if (!footer || footer.length > maxFooter) throw new Error('Invalid footer.')
  return { fileName, paper: raw.paper, landscape: raw.landscape, footer }
}

// Chromium fills .pageNumber and .totalPages; the template's text is escaped (it is HTML).
const footerTemplate = (footer) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:8px;color:#555;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>${escapeHtml(footer)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`

function printOptions(request) {
  return {
    pageSize: request.paper, landscape: request.landscape, printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footerTemplate(request.footer),
  }
}

// print(options) → the PDF bytes; showSaveDialog(options) → { canceled, filePath }; writeFile(path, bytes).
async function savePdf(raw, { print, showSaveDialog, writeFile, defaultDir }) {
  const request = pdfRequest(raw)
  const bytes = await print(printOptions(request))
  const choice = await showSaveDialog({ title: 'Export PDF', defaultPath: path.join(defaultDir, request.fileName), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (choice.canceled || !choice.filePath) return { saved: false }
  const target = /\.pdf$/i.test(choice.filePath) ? choice.filePath : `${choice.filePath}.pdf`
  await writeFile(target, bytes)
  return { saved: true, path: target }
}

module.exports = { pdfRequest, footerTemplate, printOptions, savePdf, escapeHtml }
