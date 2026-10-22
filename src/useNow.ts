import { useEffect, useState } from 'react'

// A Date that re-renders on an interval; used for the clock and for "x minutes ago" freshness labels.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
