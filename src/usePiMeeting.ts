import { useEffect, useState, useSyncExternalStore } from 'react'
import { listJobs, runInBackground, subscribeJobs } from './backgroundJobs'
import { rateLimitWait, type AzureConfig } from './azureDevOps'
import { commentsFrom, discussionOf, epicOf, latestComment, moveLabel, piFeatures, piOptions, readDiscussions, reviewComments, reviewSplit } from './piReview'
import { meetingExec, piSpanOf, type ExecFeature } from './piMeetingData'
import { defaultMeetingSettings } from './piMeetingSettings'
import { meetingReleaseInputs, meetingStreamEpics, monthsTouching } from './piMeetingSources'
import { longRunning } from './piMeetingData'
import { piName } from './myWork'
import type { AzureIteration } from './azureRead'
import type { CapacitySettings } from './capacity'
import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials'
import type { EpicSetupFile } from './epicSetup'
import { meetingOwners, streamOwners } from './epicOwners'
import { readDiscussionInto, type ReviewViewer } from './piReviewPost'
import { exportStamp } from './printExport'
import { downloadHtml } from './publishTarget'
import { buildMeetingHtml, canConductMeeting, isMeetingHtml, maxMeetingBytes, meetingBytes, meetingFeatures, meetingFileName, meetingFolder, meetingName, meetingPath, meetingPi, meetingSaveBlock, meetingSlides, meetingTitle } from './piMeeting'
import { reviewStartLabel } from './piReviewStart'
import type { PiFormSetup } from './piReviewSetup'
import type { AzureWorkItem } from './domain'

// PIR-40…PIR-47 Conduct PI Meeting on PI Review: who may build it and why not, the build as one Background jobs entry
// (read the Discussions not read yet, build the slides, download the file, then keep a copy in the Git data repository
// when that is possible), and the PI's saved meetings with Open and Download. The presentation itself: src/piMeeting.ts;
// the page parts: src/pages/PiMeeting.tsx.
const meetingJobKey = 'pireview:meeting'
// What the page's Git storage offers for the meetings (useGitStorage).
export interface MeetingGit {
  connected: boolean; readOnly: boolean; isSample: boolean
  listMeetings: (folder: string) => Promise<string[]>; readMeeting: (path: string) => Promise<string>; writeMeeting: (path: string, html: string, commitMessage: string) => Promise<{ sha: string; commitUrl: string }>
}
type Row = { item: AzureWorkItem; epic?: AzureWorkItem }
// PIR-51…PIR-57: what the executive slides are worked out from — every fetched item (hours, utilization, the previous PI,
// long-running Features), the iteration tree (the PI's dates), the capacity settings, the Release Details data and the
// Epic setup (releases and their Release Classification).
export interface MeetingContext {
  items: AzureWorkItem[]; iterations: AzureIteration[] | null; capacity: CapacitySettings; absenceEpicId?: number; withStories: boolean
  releaseState: Pick<AppState, 'azureSources' | 'releaseSource'> & Partial<Pick<AppState, 'releaseSourceSettings'>>; profiles: AzureConnectionProfileSummary[]; epicFile: EpicSetupFile | null; team: string
}
export interface MeetingInput { pi: string; rows: Row[]; setup: PiFormSetup; start: string; inRange: boolean; config: AzureConfig | null; pat: string; readBlocked: string; viewer: ReviewViewer & { env: { name?: string } | null }; git?: MeetingGit; context?: MeetingContext }
type Saved = { state: 'idle' | 'loading' | 'done' | 'error'; paths: string[]; error: string }
const fileOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const sizeText = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const utcDay = (at: Date) => at.toISOString().slice(0, 10)
// PIR-57: the Move to next PI of a Feature's latest headed review (any PI), else why there is none.
function latestMove(item: AzureWorkItem, setup: PiFormSetup, start: string) {
  const entry = discussionOf(item.key)
  if (entry?.state !== 'done') return 'Discussion not read'
  const comment = latestComment(reviewComments(commentsFrom(entry.comments, start).comments))
  return comment ? moveLabel(reviewSplit(comment.text, setup)) || 'Not given' : 'No headed review'
}

export function usePiMeeting({ pi, rows, setup, start, inRange, config, pat, readBlocked, viewer, git, context }: MeetingInput) {
  const jobs = useSyncExternalStore(subscribeJobs, listJobs)
  const building = jobs.some((job) => job.key === meetingJobKey && job.state === 'running')
  const shown = canConductMeeting(viewer.can)
  const name = meetingPi(pi)
  // PIR-40: why the button is disabled ('' when it is not).
  const why = !pi ? 'Choose a PI first.' : !inRange ? `${name} is before PI Review starts (${reviewStartLabel(start)}).` : !rows.length ? 'No Features in this PI.' : building ? 'Building the PI Review Meeting — see Background jobs.' : ''
  // PIR-47: why the copy cannot be kept in Git; the download is never blocked by it.
  const saveWhy = meetingSaveBlock({ viewingAs: viewer.viewingAs, rolesMissing: viewer.readOnly, isSample: viewer.isSample || Boolean(git?.isSample), connected: Boolean(git?.connected), readOnly: Boolean(git?.readOnly) })
  const listable = Boolean(pi && git?.connected && !git.isSample && !viewer.isSample)
  const folder = meetingFolder(name)
  // The saved meetings of the PI: listed when the PI (or Git) changes and on ↻ Refresh or after a save (round).
  const [round, setRound] = useState(0)
  const [listing, setListing] = useState<{ key: string; paths: string[]; error: string } | null>(null)
  const key = listable ? `${folder}#${round}` : ''
  useEffect(() => {
    if (!key || !git) return
    let alive = true
    git.listMeetings(folder).then((paths) => { if (alive) setListing({ key, paths: [...paths].sort((a, b) => b.localeCompare(a)), error: '' }) }, (failure: unknown) => { if (alive) setListing({ key, paths: [], error: failure instanceof Error ? failure.message : String(failure) }) })
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const saved: Saved = !key ? { state: 'idle', paths: [], error: '' } : listing?.key === key ? { state: listing.error ? 'error' : 'done', paths: listing.paths, error: listing.error } : { state: 'loading', paths: listing?.key.startsWith(`${folder}#`) ? listing.paths : [], error: '' }
  const refresh = () => setRound((value) => value + 1)
  // The last result on this page, for the PI it was for.
  const [noted, setNoted] = useState<{ folder: string; tone: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const note = noted?.folder === folder ? noted : null
  const setNote = (value: { tone: 'success' | 'warning' | 'error'; text: string } | null, at = folder) => setNoted(value && { ...value, folder: at })

  // PIR-42…PIR-47: one build — a snapshot of the Features shown and their Discussions at the click.
  function build() {
    if (why || !shown) return
    const at = new Date(), snapshot = [...rows], builtBy = viewer.env?.name?.trim() || 'Unknown'
    // PIR-51…PIR-57: the executive inputs at the click — the previous PI's Features, the long-running candidates (PIR-85:
    // by months, so also without the PI's dates).
    const settings = setup.meeting ?? defaultMeetingSettings(), today = utcDay(at), ctx = context
    const pis = ctx ? piOptions(ctx.iterations ?? [], ctx.items) : []
    const here = pis.findIndex((entry) => piName(entry).toLowerCase() === name.toLowerCase())
    const previousPath = here >= 0 ? pis[here + 1] : undefined
    const byId = ctx ? new Map(ctx.items.map((item) => [item.id, item])) : new Map<number, AzureWorkItem>()
    const previousRows: Row[] = ctx && previousPath ? piFeatures(ctx.items, previousPath, { absenceEpicId: ctx.absenceEpicId, withStories: ctx.withStories }).map((item) => ({ item, epic: epicOf(ctx.items, item, byId) })) : []
    const { span } = piSpanOf(ctx?.iterations, name)
    const streamEpics = meetingStreamEpics(settings.streams, ctx?.releaseState.releaseSourceSettings)
    const candidates = ctx ? longRunning({ items: ctx.items, streamEpics, streams: settings.streams, settings, span, spanWhy: '', today, moveOf: () => '' }).rows.map((row) => byId.get(row.id)).filter((item): item is AzureWorkItem => Boolean(item)) : []
    const file = meetingFileName(name, at), target = git
    setNote(null)
    runInBackground(meetingJobKey, `${meetingName} · ${name}`, async (progress) => {
      const toRead = new Map([...snapshot.map((row) => row.item), ...previousRows.map((row) => row.item), ...candidates].map((item) => [item.key, item]))
      const unread = [...toRead.values()].filter((item) => discussionOf(item.key)?.state !== 'done')
      let readNote = ''
      if (unread.length && !readBlocked && config) {
        const byId = new Map(unread.map((item) => [item.id, item]))
        progress(`Reading Discussions · 0 of ${unread.length}`)
        const result = await readDiscussions(unread.map((item) => item.id), (id) => readDiscussionInto(config, pat, byId.get(id)!), { rateWait: rateLimitWait, onProgress: (done, total) => progress(`Reading Discussions · ${done} of ${total}`) })
        // The PI's own Features whose Discussion is still not read (the earlier PI's and the long-running ones count apart).
        const missing = snapshot.filter((row) => discussionOf(row.item.key)?.state !== 'done').length
        if (missing) readNote = ` ${missing} Discussion${missing === 1 ? '' : 's'} could not be read: listed as not reviewed.`
        else if (result.failed + result.unread.length) readNote = ` ${result.failed + result.unread.length} Discussion${result.failed + result.unread.length === 1 ? '' : 's'} of the previous PI or of long-running Features could not be read.`
      } else if (unread.length) { const own = snapshot.filter((row) => discussionOf(row.item.key)?.state !== 'done').length; if (own) readNote = ` ${own} Discussion${own === 1 ? ' was' : 's were'} not read (${readBlocked.replace(/\.$/, '')}): listed as not reviewed.` }
      progress('Building the slides…')
      const features = meetingFeatures(snapshot, discussionOf, setup, start, name)
      const keyOf = new Map(snapshot.map((row) => [row.item.id, row.item.key]))
      const exec = ctx ? meetingExec({
        pi: name, features, iterations: ctx.iterations, items: ctx.items, capacity: ctx.capacity, today, start, setup, settings, pis,
        previousFeatures: previousPath ? meetingFeatures(previousRows, discussionOf, setup, start, piName(previousPath)) : [],
        discussionOf: (feature: ExecFeature) => discussionOf(keyOf.get(feature.id) ?? ''),
        releases: span && settings.streams.length ? meetingReleaseInputs(settings.streams, monthsTouching(span.start, span.end), ctx.releaseState, ctx.profiles, ctx.epicFile) : [],
        streamEpics, moveOf: (item) => latestMove(item, setup, start),
      }) : undefined
      // PIR-68: the Epics' Product Owners (display names) from the Epic setup in use.
      const owners = meetingOwners(ctx?.epicFile), byStream = streamOwners(ctx?.epicFile, streamEpics)
      const meeting = { pi: name, builtAt: exportStamp(at), builtBy, start, features, settings, ...(exec ? { exec } : {}), ...(ctx?.team ? { team: ctx.team } : {}), ...(Object.keys(owners).length ? { owners } : {}), ...(Object.keys(byStream).length ? { streamOwners: byStream } : {}) }
      const html = await buildMeetingHtml(meeting), slides = meetingSlides(meeting).length
      downloadHtml(html, file.replace(/\.html$/, ''))
      const done = `Downloaded ${file} (${slides} slides).${readNote}`
      const finish = (tone: 'success' | 'warning' | 'error', text: string, failed = false) => { setNote({ tone, text }, meetingFolder(name)); return { text, failed } }
      if (saveWhy || !target) return finish('warning', `${done} ${saveWhy}`)
      const bytes = meetingBytes(html)
      if (bytes > maxMeetingBytes) return finish('error', `${done} Not saved to Git: the file is ${sizeText(bytes)}, more than the ${sizeText(maxMeetingBytes)} kept in Git.`, true)
      progress('Saving a copy to Git…')
      try {
        const taken = (await target.listMeetings(meetingFolder(name)).catch(() => [] as string[])).map(fileOf)
        const path = meetingPath(name, at, taken)
        await target.writeMeeting(path, html, `${meetingTitle(name)} (built ${exportStamp(at)})`)
        refresh()
        return finish(readNote ? 'warning' : 'success', `${done} Saved to Git as ${path}.`)
      } catch (failure) {
        return finish('error', `${done} Not saved to Git: ${failure instanceof Error ? failure.message : String(failure)}`, true)
      }
    })
  }

  // PIR-47: a saved meeting — Open in a new tab (only a file of this app version, isMeetingHtml), or Download.
  async function download(path: string) {
    if (!git) return
    try { downloadHtml(await git.readMeeting(path), fileOf(path).replace(/\.html$/, '')); setNote({ tone: 'success', text: `Downloaded ${fileOf(path)}.` }) }
    catch (failure) { setNote({ tone: 'error', text: `${fileOf(path)} could not be read from Git: ${failure instanceof Error ? failure.message : String(failure)}` }) }
  }
  async function open(path: string) {
    if (!git) return
    // The tab is opened at the click (a pop-up blocker allows it then), and filled once the file is read.
    let tab: Window | null = null
    try { tab = window.open('', '_blank') } catch { tab = null }
    try {
      const html = await git.readMeeting(path)
      if (!(await isMeetingHtml(html))) { tab?.close(); setNote({ tone: 'warning', text: `${fileOf(path)} was not built by this version of the app (or was changed in Git), so it is not opened here: Download it and open it from your computer.` }); return }
      if (!tab) { downloadHtml(html, fileOf(path).replace(/\.html$/, '')); setNote({ tone: 'warning', text: `A new tab cannot be opened here (the desktop app or a pop-up blocker): downloaded ${fileOf(path)} instead.` }); return }
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      tab.opener = null
      tab.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setNote(null)
    } catch (failure) {
      tab?.close()
      setNote({ tone: 'error', text: `${fileOf(path)} could not be read from Git: ${failure instanceof Error ? failure.message : String(failure)}` })
    }
  }
  return { shown, why, saveWhy, building, build, saved, refresh, listable, note, open, download, name }
}
export type PiMeeting = ReturnType<typeof usePiMeeting>
