import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { heightFactorOf, kindOf, nearestWidth, type ChartSize, type ChartWidth } from './chartSize'
import type { ColorPins } from './onDemand'
import { InsightView, KpiCard } from './components/InsightCharts'
import type { Insight, OnDemandPage } from './onDemand'
import type { CapturedChart } from './standaloneHtml'
import { ChartHeightContext } from './useChartSize'

// OND-74: the Insights charts of a page for a standalone HTML file, drawn by the same chart components as the Insights
// tab (no drill-down), off screen at the width of each chart's size, in the app's LIGHT colours whatever the theme
// (the light values of the colour variables are read in one step without repainting the app), and taken as
// self-contained SVG: every element's computed colours, strokes and fonts written onto it, so the file needs none of
// the app's styles. A KPI card is taken as its number and caption, a summary table as its cells, a message as text.

const widths: Record<ChartWidth, number> = { third: 360, half: 540, twothirds: 720, full: 1080 }
const styleProperties = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'display', 'paint-order', 'letter-spacing', 'fill-rule']

// The light theme's value of every custom property set on :root, read synchronously (no paint in between).
function lightVariables(): [string, string][] {
  const names = new Set<string>()
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    const visit = (list: CSSRuleList) => { for (const rule of [...list]) { if (rule instanceof CSSStyleRule && rule.selectorText.includes(':root')) { for (const name of [...rule.style]) if (name.startsWith('--')) names.add(name) } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules) } }
    visit(rules)
  }
  const root = document.documentElement, theme = root.getAttribute('data-theme')
  root.setAttribute('data-theme', 'light')
  const style = getComputedStyle(root)
  const values = [...names].map((name): [string, string] => [name, style.getPropertyValue(name).trim()])
  if (theme == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme)
  return values.filter(([, value]) => value)
}

function inlineSvg(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement
  const originals = [svg, ...svg.querySelectorAll('*')], copies = [copy, ...copy.querySelectorAll('*')]
  originals.forEach((element, index) => {
    const target = copies[index] as SVGElement, computed = getComputedStyle(element)
    target.setAttribute('style', styleProperties.map((name) => { const value = computed.getPropertyValue(name); return value ? `${name}:${value}` : '' }).filter(Boolean).join(';'))
    target.removeAttribute('class'); target.removeAttribute('tabindex')
    for (const attribute of [...target.attributes]) if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name)) target.removeAttribute(attribute.name)
  })
  // The width / height as drawn (a viewBox keeps it scalable).
  copy.removeAttribute('aria-labelledby')
  return new XMLSerializer().serializeToString(copy)
}
const textOf = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()

export interface CaptureItem { insight: Insight; card: boolean; size: ChartSize; currency: string }
// Draws the items off screen, waits until each has drawn and its width settled (no timer guess), and takes them.
export async function captureCharts(page: OnDemandPage, items: CaptureItem[], colors?: ColorPins): Promise<CapturedChart[]> {
  if (!items.length) return []
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.className = 'publish-capture'
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;pointer-events:none;color-scheme:light;background:#fff'
  for (const [name, value] of lightVariables()) host.style.setProperty(name, value)
  document.body.append(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<>{items.map(({ insight, card, size, currency }) => <div key={insight.id} data-capture={insight.id} style={{ width: widths[nearestWidth(size.w)] }}>
      {card ? <KpiCard page={page} insight={insight} currency={currency} />
        : <ChartHeightContext.Provider value={heightFactorOf(size.h, kindOf(insight.type))}><InsightView quiet drill={false} page={page} insight={insight} colors={colors} currency={currency} /></ChartHeightContext.Provider>}
    </div>)}</>))
    // Settled: every item drew something and the SVG widths are the same twice in a row (at most ~5 s).
    let last = '', stable = 0
    for (let tries = 0; tries < 100 && stable < 2; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      const boxes = [...host.querySelectorAll('[data-capture]')]
      const drawn = boxes.every((box) => box.querySelector('svg, table, .empty-state, .notice, .od-kpi'))
      const now = boxes.map((box) => box.querySelector('svg')?.getAttribute('width') ?? '').join(',')
      stable = drawn && now === last ? stable + 1 : 0
      last = now
    }
    return items.map(({ insight, card, size }): CapturedChart => {
      const box = host.querySelector(`[data-capture="${CSS.escape(insight.id)}"]`)
      const base = { id: insight.id, title: insight.title || 'Untitled', width: nearestWidth(size.w) }
      if (card) return { ...base, kind: 'card', value: textOf(box?.querySelector('.od-kpi strong')), caption: textOf(box?.querySelector('.od-kpi-caption')) }
      const note = textOf(box?.querySelector('.od-insight-warning')) || undefined
      const svg = box?.querySelector<SVGSVGElement>('svg[role="img"]')
      const legend = [...(box?.querySelectorAll('.viz-legend li, .viz-donut-legend li') ?? [])].map((item) => ({ label: [...item.childNodes].map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '), color: getComputedStyle(item.querySelector('i, span, svg') ?? item).backgroundColor || getComputedStyle(item).color }))
      if (insight.type !== 'table' && svg) return { ...base, kind: 'svg', svg: inlineSvg(svg), legend, note }
      const table = box?.querySelector('table')
      if (table) return { ...base, kind: 'table', table: [...table.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('th, td')].map(textOf)), note }
      return { ...base, kind: 'text', text: textOf(box?.querySelector('.empty-state, .notice')) || 'This chart could not be included.' }
    })
  } finally {
    root.unmount()
    host.remove()
  }
}
