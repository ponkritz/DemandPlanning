// FET-22: what Refresh fetches and in which order — the Time Writing connection in use first, then every read-only
// connection in their saved order; other Time Writing connections (duplicates) are left out.
export function fetchAllOrder<T extends { id: string; role?: string }>(profiles: T[], timeWritingId: string | undefined): T[] {
  const main = profiles.filter((profile) => profile.id === timeWritingId && (profile.role ?? 'time-tracking') === 'time-tracking')
  return [...main, ...profiles.filter((profile) => (profile.role ?? 'time-tracking') !== 'time-tracking')]
}
