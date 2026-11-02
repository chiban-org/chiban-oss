export interface DiffEntry {
  path: string
  town: unknown
  upstream: unknown
}

function escapeSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function walk(town: unknown, upstream: unknown, path: string, out: DiffEntry[]): void {
  if (Array.isArray(town) && Array.isArray(upstream)) {
    const length = Math.max(town.length, upstream.length)
    for (let i = 0; i < length; i += 1) walk(town[i], upstream[i], `${path}/${i}`, out)
    return
  }
  if (isRecord(town) && isRecord(upstream)) {
    const keys = [...new Set([...Object.keys(town), ...Object.keys(upstream)])].sort()
    for (const key of keys) walk(town[key], upstream[key], `${path}/${escapeSegment(key)}`, out)
    return
  }
  if (!Object.is(town, upstream)) out.push({ path, town, upstream })
}

export function starterDiff(townBody: unknown, upstreamBody: unknown): DiffEntry[] {
  const out: DiffEntry[] = []
  walk(townBody, upstreamBody, '', out)
  return out
}
