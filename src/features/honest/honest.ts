import type { LayerStatus } from '@/features/gis/layerStatus'

export type HonestValue<T> =
  | { state: 'known'; value: T; asOf: string }
  | { state: 'stale'; value: T; asOf: string; staleAfterDays: number }
  | { state: 'unknown' }
  | { state: 'import_failed'; value: T | null; lastSuccessAt: string | null; lastFailureAt: string }
  | { state: 'not_applicable' }

export function honestFromLayer<T>(status: LayerStatus, value: T | null): HonestValue<T> {
  switch (status.state) {
    case 'not_configured':
      return { state: 'not_applicable' }
    case 'never_imported':
      return { state: 'unknown' }
    case 'import_failed':
      return {
        state: 'import_failed',
        value,
        lastSuccessAt: status.lastSuccessAt,
        lastFailureAt: status.lastFailureAt ?? '',
      }
    case 'stale':
      return value === null || status.lastSuccessAt === null
        ? { state: 'unknown' }
        : {
            state: 'stale',
            value,
            asOf: status.lastSuccessAt,
            staleAfterDays: status.staleAfterDays,
          }
    case 'fresh':
      return value === null || status.lastSuccessAt === null
        ? { state: 'unknown' }
        : { state: 'known', value, asOf: status.lastSuccessAt }
  }
}

export function honestText(value: HonestValue<string>, missing: string): string {
  if (value.state === 'known' || value.state === 'stale') return value.value
  if (value.state === 'import_failed') return value.value ?? missing
  return missing
}
