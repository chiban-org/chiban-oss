export const RECENT_SEARCH_LIMIT = 6

export function rememberSearch(previous: readonly string[], query: string): string[] {
  const trimmed = query.trim()
  if (trimmed.length < 2) return [...previous]
  const key = trimmed.toLowerCase()
  return [trimmed, ...previous.filter((q) => q.toLowerCase() !== key)].slice(0, RECENT_SEARCH_LIMIT)
}

export function parseRecent(raw: string | null): string[] {
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((q): q is string => typeof q === 'string').slice(0, RECENT_SEARCH_LIMIT)
      : []
  } catch {
    return []
  }
}
