// OND-68…OND-73 Export PDF… of an Insights tab or an On-Demand Dashboard: the person picks the charts (KPI cards
// included), whether the active filters apply and are stated, the paper (A4 / Letter, portrait / landscape) and what the
// footer says besides the page name and "Page n of m": the date and / or the time of the export, in their own time zone.
// The desktop app prints the print view to a PDF file (Electron printToPDF, electron/pdf-export.cjs); a browser opens
// the print view and its print dialog ("Save as PDF"). Nothing here touches the DOM.

export type PaperSize = 'A4' | 'Letter'
export type Orientation = 'portrait' | 'landscape'
export interface PdfOptions { charts: string[]; filters: boolean; paper: PaperSize; orientation: Orientation; footerDate: boolean; footerTime: boolean }
export const paperSizes: PaperSize[] = ['A4', 'Letter']
export const defaultPdfOptions = (charts: string[]): PdfOptions => ({ charts, filters: true, paper: 'A4', orientation: 'landscape', footerDate: true, footerTime: true })

// "24 Nov 2026, 14:32 CET": the moment of the export in the viewer's own zone (Intl), with the zone's short name;
// the date or the time alone when only one is ticked; '' for neither. timeZone only for tests.
export function exportStamp(at: Date, { date = true, time = true }: { date?: boolean; time?: boolean } = {}, timeZone?: string) {
  const zone = timeZone ? { timeZone } : {}
  const day = date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...zone }).format(at) : ''
  const clock = time ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short', ...zone }).format(at) : ''
  return [day, clock].filter(Boolean).join(', ')
}
// The footer's text left of "Page n of m": the page name, the date / time of the export, "Sample data" in Sample.
export function footerText({ pageName, stamp, sample }: { pageName: string; stamp: string; sample: boolean }) {
  return [oneLine(pageName), stamp ? `Exported ${stamp}` : '', sample ? 'Sample data' : ''].filter(Boolean).join(' · ')
}
export const oneLine = (text: string) => text.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim()
// The PDF's file name: "{page}-{YYYY-MM-DD}.pdf" in the viewer's own day, "Sample-" first in Sample; only letters,
// digits, - _ . and spaces kept (no path, no reserved characters).
export function pdfFileName(pageName: string, sample: boolean, at: Date, timeZone?: string) {
  const day = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(at)
  return `${sample ? 'Sample-' : ''}${safeName(pageName)}-${day}.pdf`
}
export const safeName = (name: string) => oneLine(name).replace(/[^\p{L}\p{N} _.-]+/gu, '-').replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 80) || 'Page'
// A text as a CSS string ("…"): backslash, quotes and line breaks escaped, so it can only ever be one string.
export const cssString = (text: string) => `"${oneLine(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\3c ')}"`

// The paper in millimetres and the printable width (CSS px at 96 dpi) inside the margins.
const paperMm: Record<PaperSize, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4] }
export const margins = { side: 12, top: 12, bottom: 16 }
export function printableWidth(paper: PaperSize, orientation: Orientation) {
  const [short, long] = paperMm[paper]
  return Math.floor(((orientation === 'portrait' ? short : long) - 2 * margins.side) * 96 / 25.4)
}
// The @page rule of the print view. pageNumbers: the browser can draw page margin boxes (CSS Paged Media, Chromium 131
// and later): the footer and "Page n of m" are drawn in the bottom margin of every page. Without them (Firefox, Safari)
// only the size and margins are set and the footer is a fixed element (no page numbers: CSS has no other way to count
// the pages). desktop: the footer comes from Electron's own footer template (with its page numbers), so none here.
export function pageRule(options: Pick<PdfOptions, 'paper' | 'orientation'>, footer: string, { pageNumbers, desktop = false }: { pageNumbers: boolean; desktop?: boolean }) {
  const boxes = pageNumbers && !desktop ? ` @bottom-left { content: ${cssString(footer)}; font: 8pt sans-serif; color: #555; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #555; }` : ''
  return `@page { size: ${options.paper} ${options.orientation}; margin: ${margins.top}mm ${margins.side}mm ${margins.bottom}mm;${boxes} }`
}
// Whether this browser draws page margin boxes (CSSMarginRule exists where @top-left … @bottom-right are supported).
export const supportsPageNumbers = () => typeof (globalThis as { CSSMarginRule?: unknown }).CSSMarginRule !== 'undefined'
// What is sent to the desktop app to make the PDF (it checks every field again, electron/pdf-export.cjs).
export interface DesktopPdfRequest { fileName: string; paper: PaperSize; landscape: boolean; footer: string }
export const desktopPdfRequest = (options: PdfOptions, fileName: string, footer: string): DesktopPdfRequest => ({ fileName, paper: options.paper, landscape: options.orientation === 'landscape', footer })
export interface DesktopPdfResult { saved: boolean; path?: string }
// The desktop app's file bridge (electron/preload.cjs); absent in a browser.
declare global {
  interface DesktopFiles { savePdf: (request: DesktopPdfRequest) => Promise<DesktopPdfResult> }
  interface Window { desktopFiles?: DesktopFiles }
}
