function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalize((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}
