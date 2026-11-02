const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const WORD = /[A-Za-z0-9_]+/g

export function findIsoDates(text: string): string[] {
  return text.match(ISO_DATE) ?? []
}

export function findUuids(text: string): string[] {
  return text.match(UUID) ?? []
}

export function findRawKeys(text: string, keys: readonly string[]): string[] {
  const tokens = new Set(text.match(WORD) ?? [])
  return keys.filter((key) => tokens.has(key))
}
