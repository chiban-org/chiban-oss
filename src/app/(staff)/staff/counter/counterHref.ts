export const COUNTER_START = '/staff/counter'

export function counterHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, value)
  }
  return `${COUNTER_START}?${query.toString()}`
}
