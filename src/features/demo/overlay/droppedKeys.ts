import { joinPath, type OverlayIssue } from '@/features/demo/overlay/overlayIssue'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function droppedKeys(input: unknown, parsed: unknown, path = ''): OverlayIssue[] {
  if (Array.isArray(input) && Array.isArray(parsed)) {
    return input.flatMap((item, i) => droppedKeys(item, parsed[i], joinPath(path, i)))
  }
  if (!isRecord(input) || !isRecord(parsed)) return []
  const kept = new Map(Object.entries(parsed))
  return Object.entries(input).flatMap(([key, value]) => {
    const at = joinPath(path, key)
    return kept.has(key)
      ? droppedKeys(value, kept.get(key), at)
      : [{ path: at, message: `${key} is not a known key here` }]
  })
}
