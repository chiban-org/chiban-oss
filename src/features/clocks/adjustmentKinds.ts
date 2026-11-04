export const ADJUSTMENT_KINDS = [
  'extension',
  'waiver',
  'renewal',
  'tolling',
  'statutory_exception',
  'statutory_floor',
] as const

export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

export const ADJUSTMENT_KIND_LABELS: ReadonlyMap<AdjustmentKind, string> = new Map([
  ['extension', 'Extension'],
  ['waiver', 'Waiver'],
  ['renewal', 'Renewal'],
  ['tolling', 'Tolling'],
  ['statutory_exception', 'Statutory exception'],
  ['statutory_floor', 'Statutory minimum'],
])

export function adjustmentKindLabel(kind: string): string {
  return ADJUSTMENT_KIND_LABELS.get(kind as AdjustmentKind) ?? kind
}
