import { nearestWidth } from '../chartSize'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { recordJob, runInBackground } from '../backgroundJobs'
import type { ChartSize } from '../chartSize'
import { defaultPdfOptions, desktopPdfRequest, exportStamp, footerText, pageRule, paperSizes, pdfFileName, printableWidth, supportsPageNumbers, type PdfOptions } from '../printExport'
import { Modal, Notice } from './ui'

// OND-68…OND-73 Export PDF… of the Insights tab or an On-Demand Dashboard (UI-STANDARDS §4: a pop-up, then the result
// in Background jobs, §8). The pop-up: the charts (all, or a selection — KPI cards too), "Include the active filters",
// the paper and orientation, and the footer's date / time of the export. Then a print view of the chosen charts on
// white paper (the app's light colours), drawn by the same chart components as on screen (vector SVG, at the width and
// height of each chart's size), a chart never split over two pages. The desktop app saves it as a PDF where the person
// chooses (printToPDF); a browser opens its print dialog ("Save as PDF").

// One chart or card that can be printed: render(filters) draws it with or without the active filters.
export interface PrintItem { id: string; title: string; card: boolean; group?: string; size: ChartSize; render: (filters: boolean) => ReactNode }

export function PdfExport({ eyebrow, pageName, items, filtersLine, sample, onClose }: { eyebrow: string; pageName: string; items: PrintItem[]; filtersLine: (filters: boolean) => string; sample: boolean; onClose: () => void }) {
  const [printing, setPrinting] = useState<{ options: PdfOptions; at: Date } | null>(null)
  const desktop = Boolean(window.desktopFiles?.savePdf)
  const pageNumbers = desktop || supportsPageNumbers()
  if (!printing) return <PdfDialog eyebrow={eyebrow} pageName={pageName} items={items} desktop={desktop} pageNumbers={pageNumbers} sample={sample} onCancel={onClose} onExport={(options) => setPrinting({ options, at: new Date() })} />
  const { options, at } = printing
  const stamp = exportStamp(at, { date: options.footerDate, time: options.footerTime })
  const footer = footerText({ pageName, stamp, sample })
  const chosen = items.filter((item) => options.charts.includes(item.id))
  const ready = () => {
    const bridge = window.desktopFiles
    if (bridge?.savePdf) {
      runInBackground(`pdf:${pageName}`, `Export PDF · ${pageName}`, async (progress) => {
        progress('Making the PDF…')
        try {
          const result = await bridge.savePdf(desktopPdfRequest(options, pdfFileName(pageName, sample, at), footer))
          return { text: result.saved ? `Saved ${chosen.length} chart${chosen.length === 1 ? '' : 's'} of ${pageName} as ${result.path}.` : 'Not saved: the save dialog was cancelled.' }
        } finally { onClose() }
      })
      return
    }
    recordJob(`pdf:${pageName}`, `Export PDF · ${pageName}`, { text: `Print view of ${chosen.length} chart${chosen.length === 1 ? '' : 's'} opened with the print dialog: choose “Save as PDF” as the printer.${pageNumbers ? '' : ' This browser cannot number the pages; the footer shows the page name and the date.'}` })
    window.print()
  }
  return <PrintView pageName={pageName} eyebrow={eyebrow} stamp={stamp} footer={footer} filtersLine={options.filters ? filtersLine(true) : filtersLine(false)} sample={sample} items={chosen} options={options} desktop={desktop} pageNumbers={pageNumbers} onReady={ready} onClose={onClose} />
}

function PdfDialog({ eyebrow, pageName, items, desktop, pageNumbers, sample, onCancel, onExport }: { eyebrow: string; pageName: string; items: PrintItem[]; desktop: boolean; pageNumbers: boolean; sample: boolean; onCancel: () => void; onExport: (options: PdfOptions) => void }) {
  const [options, setOptions] = useState<PdfOptions>(() => defaultPdfOptions(items.map((item) => item.id)))
  const [all, setAll] = useState(true)
  const [example] = useState(() => exportStamp(new Date()))
  const set = (change: Partial<PdfOptions>) => setOptions((current) => ({ ...current, ...change }))
  const charts = all ? items.map((item) => item.id) : options.charts
  const noneReason = charts.length ? '' : 'Tick at least one chart or card.'
  const tick = (id: string, on: boolean) => set({ charts: on ? items.filter((item) => item.id === id || options.charts.includes(item.id)).map((item) => item.id) : options.charts.filter((entry) => entry !== id) })
  return <Modal eyebrow={eyebrow} title="Export PDF" onClose={onCancel}>
    <form className="pgb-form pdf-form" noValidate onSubmit={(event) => { event.preventDefault(); if (!noneReason) onExport({ ...options, charts }) }}>
      <fieldset><legend>Charts</legend>
        <label className="check"><input type="radio" name="pdf-charts" checked={all} onChange={() => { setAll(true); set({ charts: items.map((item) => item.id) }) }} />All ({items.length})</label>
        <label className="check"><input type="radio" name="pdf-charts" checked={!all} onChange={() => setAll(false)} />A selection</label>
        {!all && <div className="pdf-charts">{items.map((item) => <label key={item.id} className="check"><input type="checkbox" checked={options.charts.includes(item.id)} onChange={(event) => tick(item.id, event.target.checked)} />{item.title || 'Untitled'}{item.card ? ' (KPI card)' : ''}{item.group ? ` · ${item.group}` : ''}</label>)}</div>}
      </fieldset>
      <label className="check"><input type="checkbox" checked={options.filters} onChange={(event) => set({ filters: event.target.checked })} />Include the active filters</label>
      <small>On: the charts as narrowed by your filter row, which is stated under the title. Off: every row of the page. Each chart’s own filters always apply.</small>
      <div className="form-row">
        <label>Page size<select aria-label="Page size" value={options.paper} onChange={(event) => set({ paper: event.target.value === 'Letter' ? 'Letter' : 'A4' })}>{paperSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <fieldset className="pdf-orientation"><legend>Orientation</legend>
          {(['portrait', 'landscape'] as const).map((value) => <label key={value} className="check"><input type="radio" name="pdf-orientation" checked={options.orientation === value} onChange={() => set({ orientation: value })} />{value === 'portrait' ? 'Portrait' : 'Landscape'}</label>)}
        </fieldset>
      </div>
      <fieldset><legend>Footer</legend>
        <label className="check"><input type="checkbox" checked={options.footerDate} onChange={(event) => set({ footerDate: event.target.checked })} />Date of export</label>
        <label className="check"><input type="checkbox" checked={options.footerTime} onChange={(event) => set({ footerTime: event.target.checked })} />Time of export</label>
        <small>The footer always shows {pageName}{pageNumbers ? ' and “Page n of m”' : ''}{sample ? ' and “Sample data”' : ''}; the date and time in your time zone, e.g. “{example}”.{pageNumbers ? '' : ' This browser cannot number the pages (no page margin boxes): the footer shows no page numbers.'}</small>
      </fieldset>
      <p className="muted">{desktop ? 'Saved as a PDF file where you choose.' : 'Opens a print view and your browser’s print dialog: choose “Save as PDF” as the printer.'}</p>
      {noneReason && <p className="field-error" role="alert">{noneReason}</p>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary" disabled={Boolean(noneReason)} title={noneReason || undefined}>Export PDF</button></div>
    </form>
  </Modal>
}

// The print view: on screen a preview over the app (with Print… and Close), in print only the sheet. While it is open the
// app is drawn in the light theme, so the PDF is on white paper whatever theme the person uses.
function PrintView({ pageName, eyebrow, stamp, footer, filtersLine, sample, items, options, desktop, pageNumbers, onReady, onClose }: { pageName: string; eyebrow: string; stamp: string; footer: string; filtersLine: string; sample: boolean; items: PrintItem[]; options: PdfOptions; desktop: boolean; pageNumbers: boolean; onReady: () => void; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  const latest = useRef(onReady)
  useEffect(() => { latest.current = onReady })
  useEffect(() => {
    const root = document.documentElement, theme = root.getAttribute('data-theme')
    root.setAttribute('data-theme', 'light')
    document.body.classList.add('printing')
    return () => { document.body.classList.remove('printing'); if (theme == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme) }
  }, [])
  // Ready when every chosen chart has drawn (its SVG, table, card or message) and the widths have settled.
  useEffect(() => {
    let tries = 0, stable = 0, last = ''
    const timer = window.setInterval(() => {
      const boxes = [...(sheet.current?.querySelectorAll<HTMLElement>('[data-print-item]') ?? [])]
      const drawn = boxes.every((box) => box.querySelector('svg, table, .empty-state, .notice, .metric, .od-kpi, .narrative'))
      const widths = boxes.map((box) => box.querySelector('svg')?.getAttribute('width') ?? '').join(',')
      stable = drawn && widths === last ? stable + 1 : 0
      last = widths
      tries += 1
      if ((stable >= 2 || tries > 100) && !done.current) { done.current = true; window.clearInterval(timer); latest.current() }
    }, 50)
    return () => window.clearInterval(timer)
  }, [])
  const cards = items.filter((item) => item.card), charts = items.filter((item) => !item.card)
  const width = printableWidth(options.paper, options.orientation)
  return createPortal(<div className={`print-root${pageNumbers || desktop ? ' print-numbered' : ''}`} role="dialog" aria-modal="true" aria-label={`Print view of ${pageName}`}>
    <style>{pageRule(options, footer, { pageNumbers, desktop })}</style>
    <div className="print-toolbar">
      <span><strong>Print view</strong> · {pageName} · {options.paper} {options.orientation} · {items.length} chart{items.length === 1 ? '' : 's'}</span>
      <span className="button-row">{desktop ? <span className="muted" role="status">Making the PDF…</span> : <button type="button" className="primary" onClick={() => window.print()}>Print…</button>}<button type="button" className="ghost" onClick={onClose}>Close</button></span>
    </div>
    <div className="print-sheet" ref={sheet} style={{ width }}>
      <header className="print-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{pageName}</h1>
        {stamp && <p className="muted">Exported {stamp}</p>}
        {filtersLine && <p className="print-filters">{filtersLine}</p>}
        {sample && <Notice tone="warning">Sample data — made-up rows, not the page’s data.</Notice>}
      </header>
      {cards.length > 0 && <div className="print-cards metric-grid compact">{cards.map((item) => <div key={item.id} className="print-card" data-print-item={item.id}>{item.render(options.filters)}</div>)}</div>}
      <div className="print-grid">{charts.map((item) => <div key={item.id} className={`print-chart print-w-${nearestWidth(item.size.w)}`} data-print-item={item.id}>{item.render(options.filters)}</div>)}</div>
      <footer className="print-footer"><span>{footer}</span>{(pageNumbers || desktop) && <span className="print-footer-pages">Page n of m</span>}</footer>
    </div>
  </div>, document.body)
}
