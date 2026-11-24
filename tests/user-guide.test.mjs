import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { parseInline, parseMarkdown, plainText } from '../src/markdown.ts'

// The user guide (DOC-14…DOC-16, TC-DOC-06): docs/USER-GUIDE.md, its screenshots in docs/user-guide/images and its clips
// (WebM with a PNG poster) in docs/user-guide/media — every picture and clip it shows exists, every file there is shown,
// every chapter is listed, its links land, it is the first document of the Documentation page, and every picture is
// made by the screenshot script from synthetic data.
const docs = new URL('../docs/', import.meta.url)
const guide = readFileSync(new URL('USER-GUIDE.md', docs), 'utf8').replace(/\r\n/g, '\n') // Windows checkouts have CRLF
const blocks = parseMarkdown(guide)
const script = readFileSync(new URL('../scripts/user-guide-shots.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const inlineOf = (block) => block.kind === 'paragraph' ? [block.text] : block.kind === 'list' ? block.items.flatMap(function flat(item) { return [item.text, ...item.children.flatMap((child) => child.items.flatMap(flat))] }) : block.kind === 'table' ? [...block.header, ...block.rows.flat()] : []
const parts = blocks.flatMap(inlineOf).flatMap((text) => parseInline(text))
const images = parts.filter((part) => part.kind === 'image').map((part) => part.href)
const videos = blocks.filter((block) => block.kind === 'video')
const folder = (name) => readdirSync(new URL(`user-guide/${name}/`, docs))

test('DOC-15: every screenshot, clip and poster the guide shows is a file of docs/user-guide, and every file there is shown', () => {
  assert.ok(images.length >= 30, `the guide has its screenshots (${images.length})`)
  assert.ok(videos.length >= 6, `the guide has its clips (${videos.length})`)
  const referenced = [...images, ...videos.flatMap((video) => [video.src, video.poster])]
  for (const path of referenced) {
    assert.match(path, /^user-guide\/(images\/[a-z0-9-]+\.png|media\/[a-z0-9-]+\.(webm|png))$/, `${path}: a relative path in the guide's folders, lower case`)
    assert.ok(existsSync(new URL(path, docs)), `${path} exists`)
  }
  for (const file of folder('images')) assert.ok(referenced.includes(`user-guide/images/${file}`), `images/${file} is shown in the guide`)
  for (const file of folder('media')) assert.ok(referenced.includes(`user-guide/media/${file}`), `media/${file} is shown in the guide`)
  for (const image of parts.filter((part) => part.kind === 'image')) assert.ok(image.text.trim().length > 5, `${image.href} has a text alternative`)
})

test('DOC-15: every clip has a poster, a title and a caption, and its steps are written out next to it', () => {
  const lines = guide.split('\n')
  for (const video of videos) {
    assert.ok(video.poster, `${video.src} has a poster`)
    assert.ok(video.title.length > 10, `${video.src} has a title`)
    const at = lines.findIndex((line) => line.includes(`src="${video.src}"`))
    assert.match(lines[at + 2] ?? '', /^\*Clip: .+\*$/, `${video.src} is followed by its caption`)
    assert.match(lines[at], /<video controls muted preload="none" /, `${video.src} loads only when played, without sound`)
    const before = lines.slice(Math.max(0, at - 40), at).join('\n')
    assert.match(before, /^\d+\. /m, `${video.src} follows numbered steps`)
  }
})

test('DOC-15: the guide\'s pictures and clips stay small', () => {
  const size = (name) => folder(name).reduce((sum, file) => sum + statSync(new URL(`user-guide/${name}/${file}`, docs)).size, 0)
  assert.ok(size('images') < 8 * 1048576, `screenshots under 8 MB (${(size('images') / 1048576).toFixed(2)} MB)`)
  assert.ok(size('media') < 12 * 1048576, `clips and posters under 12 MB (${(size('media') / 1048576).toFixed(2)} MB)`)
  for (const file of folder('media').filter((name) => name.endsWith('.webm'))) assert.ok(statSync(new URL(`user-guide/media/${file}`, docs)).size < 1.5 * 1048576, `${file} under 1.5 MB`)
  for (const name of ['images', 'media']) { const lower = folder(name).map((file) => file.toLowerCase()); assert.equal(new Set(lower).size, lower.length, `no two files in ${name}/ differ only in letter case`) }
})

test('DOC-14: every chapter is listed in Contents, and every link in the guide lands on a heading', () => {
  const chapters = blocks.filter((block) => block.kind === 'heading' && block.level === 2 && block.text !== 'Contents')
  const contents = guide.split('\n## Contents\n')[1].split('\n## ')[0]
  const listed = [...contents.matchAll(/^\d+\. \[([^\]]+)\]\(#([^)]+)\)$/gm)].map((match) => ({ text: match[1], anchor: match[2] }))
  assert.deepEqual(listed.map((entry) => entry.text), chapters.map((chapter) => plainText(chapter.text)), 'Contents lists every chapter, in order')
  const ids = new Set(blocks.filter((block) => block.kind === 'heading').map((block) => block.id))
  for (const link of parts.filter((part) => part.kind === 'link' && part.href.startsWith('#'))) assert.ok(ids.has(link.href.slice(1)), `${link.href} is a heading of the guide`)
  for (const area of ['Getting started', 'Roles and rights', 'Daily work', 'Reports', 'On-Demand pages', 'Admin', 'Troubleshooting and FAQ']) assert.ok(chapters.some((chapter) => chapter.text === area), `chapter ${area}`)
})

test('DOC-14: the guide describes the features of its build: no placeholder is left, and My dashboard editing, Save view for everyone and the chart editor\'s tabs have their sections', () => {
  assert.doesNotMatch(guide, /coming in the next release|placeholder —|\(coming/i, 'no placeholder or pending-feature section')
  const section = (title) => { const start = guide.indexOf(`#### ${title}\n`) >= 0 ? guide.indexOf(`#### ${title}\n`) : guide.indexOf(`### ${title}\n`); assert.ok(start >= 0, `section ${title}`); return guide.slice(start, guide.indexOf('\n### ', start + 5)) }
  for (const [title, words] of [['Edit My dashboard', ['＋ Add block…', 'Data source', 'Customize', 'Reset to the default My dashboard']], ['Save view for everyone', ['Save view for everyone', 'Clear the view for everyone', 'Use the view for everyone']], ['Add a chart or table', ['**Data**', '**Filters**', '**Format**', '**Elements**', '**Narrative**', 'red marker']]]) {
    const text = section(title)
    for (const word of words) assert.ok(text.includes(word), `${title} names ${word}`)
    assert.match(text, /^1\. /m, `${title} has numbered steps`)
    assert.match(text, /!\[[^\]]+\]\(user-guide\/images\//, `${title} has a screenshot`)
  }
  assert.doesNotMatch(guide, /\*\*Display\*\*/, 'the chart editor has no Display group any more')
})

test('DOC-14, DOC-16: the user guide is the first document of the Documentation page, and every picture is made by the screenshot script', () => {
  const bundled = readFileSync(new URL('../src/docs/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.match(bundled, /export const projectDocs: ProjectDoc\[\] = \[\n {2}\{ file: 'USER-GUIDE.md', label: 'User guide'/)
  for (const path of images) assert.ok(script.includes(`'${path.slice('user-guide/images/'.length, -4)}'`), `${path} is made by scripts/user-guide-shots.mjs`)
  for (const video of videos) assert.ok(script.includes(`'${video.src.slice('user-guide/media/'.length, -5)}'`), `${video.src} is recorded by scripts/user-guide-shots.mjs`)
  // DOC-16: the script uses made-up data and stops on anything else.
  assert.match(script, /const forbidden = \//)
  assert.doesNotMatch(script.replace(/const (scrubs|forbidden) = [^\n]+\n(?: {2}\[[^\n]+\n)*/g, ''), /@(?!example\.com)[a-z-]+\.[a-z]/i, 'every email in the script is @example.com')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['docs:shots'], 'node scripts/user-guide-shots.mjs')
  assert.equal(pkg.scripts['docs:videos'], 'node scripts/user-guide-shots.mjs --videos')
})
