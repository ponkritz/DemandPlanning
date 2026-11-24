import { Fragment, type ReactNode } from 'react'
import { linkTarget, parseInline, type Block, type ListBlock } from '../markdown'

// Renders parsed Markdown blocks as React elements. Links to other bundled documents and to anchors are handled by
// the page (onLink); external https links open in a new tab. Images and videos are shown only when `media` resolves their
// path to a file of this build (DOC-13); otherwise the image's alt text or the video's title is shown as text.
export function Markdown({ blocks, docs, currentDoc, onLink, media = () => undefined }: { blocks: Block[]; docs: string[]; currentDoc?: string; onLink: (doc: string | null, anchor: string) => void; media?: (path: string) => string | undefined }) {
  const inline = (text: string): ReactNode => parseInline(text).map((part, index) => {
    if (part.kind === 'code') return <code key={index}>{part.text}</code>
    if (part.kind === 'image') { const src = media(part.href); return src ? <img key={index} className="markdown-image" src={src} alt={part.text} loading="lazy" /> : <span key={index} className="muted">[{part.text}]</span> }
    if (part.kind === 'strong') return <strong key={index}>{inline(part.text)}</strong>
    if (part.kind === 'em') return <em key={index}>{inline(part.text)}</em>
    if (part.kind === 'link') {
      const target = linkTarget(part.href, docs, currentDoc)
      if (target.kind === 'external') return <a key={index} href={target.href} target="_blank" rel="noreferrer">{inline(part.text)}</a>
      if (target.kind === 'none') return <Fragment key={index}>{inline(part.text)}</Fragment>
      const doc = target.kind === 'doc' ? target.doc : null
      return <a key={index} href={`#${target.anchor}`} onClick={(event) => { event.preventDefault(); onLink(doc, target.anchor) }}>{inline(part.text)}</a>
    }
    return <Fragment key={index}>{part.text}</Fragment>
  })
  const list = (block: ListBlock, key: number | string): ReactNode => {
    const items = block.items.map((item, index) => <li key={index}>{inline(item.text)}{item.children.map((child, childIndex) => list(child, `${index}-${childIndex}`))}</li>)
    return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
  }
  return <div className="markdown">{blocks.map((block, index) => {
    if (block.kind === 'heading') { const Tag = `h${Math.min(6, block.level + 1)}` as 'h2'; return <Tag key={index} id={block.id}>{inline(block.text)}</Tag> }
    if (block.kind === 'paragraph') return <p key={index}>{inline(block.text)}</p>
    if (block.kind === 'list') return list(block, index)
    if (block.kind === 'rule') return <hr key={index} />
    if (block.kind === 'video') {
      const src = media(block.src), poster = block.poster ? media(block.poster) : undefined
      return src ? <figure key={index} className="markdown-video"><video controls muted preload="none" src={src} poster={poster} aria-label={block.title || 'Video'} /></figure> : <p key={index} className="muted">[Video: {block.title || block.src}]</p>
    }
    return <div key={index} className="azure-table markdown-table"><table>{block.header.some(Boolean) && <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell)}</th>)}</tr></thead>}<tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] ?? '')}</td>)}</tr>)}</tbody></table></div>
  })}</div>
}
