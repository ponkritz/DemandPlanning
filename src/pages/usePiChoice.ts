import { useEffect, useMemo, useState } from 'react'
import { readAzureIterations, type AzureIteration } from '../azureDevOps'
import { defaultPi, piOptions, samePi } from '../piReview'
import { useNow } from '../useNow'
import type { AzureWorkspace } from '../useAzureWorkspace'

// PIR-02 (PI Review), PIR-17 (My PI Review): the PI picker's PIs — the Time Writing connection's iteration tree (null
// when not read or when the read failed) and the fetched items — the default PI (the current one by the Sprint dates)
// and the viewer's choice, remembered in this browser under storageKey.
export function usePiChoice({ config, pat, items, isSample }: Pick<AzureWorkspace, 'config' | 'pat' | 'items' | 'isSample'>, storageKey: string) {
  const iterations = usePiIterations({ config, pat, isSample })
  const today = useNow(3_600_000)
  const options = useMemo(() => piOptions(iterations.list ?? [], items), [iterations.list, items])
  const fallback = useMemo(() => defaultPi(iterations.list, items, today, iterations.problem), [iterations.list, items, today, iterations.problem])
  const current = fallback.why === 'current' ? fallback.pi : ''
  const [chosen, setChosen] = useState(() => { try { return localStorage.getItem(storageKey) ?? '' } catch { return '' } })
  const remembered = options.find((pi) => samePi(pi, chosen))
  const pi = remembered ?? (iterations.done ? fallback.pi : '')
  const choose = (value: string) => { setChosen(value); try { if (value) localStorage.setItem(storageKey, value); else localStorage.removeItem(storageKey) } catch { /* the choice is a convenience only */ } }
  return { iterations, options, fallback, current, remembered, pi, choose }
}

// PIR-02, PIR-25: the Time Writing connection's iteration tree, read once when the hook is used (the PI pickers, the
// Close pop-up's next PI): list null when not read (no PAT, sample data, enabled false) or when the read failed.
export function usePiIterations({ config, pat, isSample }: Pick<AzureWorkspace, 'config' | 'pat' | 'isSample'>, enabled = true) {
  const source = enabled && config && pat.trim() && !isSample ? [config.baseUrl ?? '', config.organization, config.project, config.team].join('|') : ''
  const [read, setRead] = useState<{ source: string; list: AzureIteration[] | null; problem: string } | null>(null)
  useEffect(() => {
    if (!source || !config) return
    let live = true
    readAzureIterations(config, pat).then((list) => { if (live) setRead({ source, list, problem: '' }) }, (failure: unknown) => { if (live) setRead({ source, list: null, problem: failure instanceof Error ? failure.message : 'the iterations could not be read' }) })
    return () => { live = false }
  }, [source, config, pat])
  return !source ? { list: null, problem: isSample ? 'synthetic sample data is loaded' : 'the Time Writing connection has no PAT here', done: true }
    : read?.source === source ? { ...read, done: true } : { list: null, problem: '', done: false }
}
