import { stateLabel } from '@/features/applications/stateLabel'
import type { CoreState } from '@/features/applications/states'
import { lowerFirst, words } from '@/lib/words'

export const APPROVED = 'Approved'

export function substepLabel(substep: string, declared: { key: string; label: string }[]): string {
  return declared.find((s) => s.key === substep)?.label ?? words(substep)
}

export function applicationStatusText(
  state: CoreState,
  substep: string | null,
  declared: { key: string; label: string }[],
  board = true,
): string {
  const base = !board && state === 'decided' ? APPROVED : stateLabel(state)
  return substep === null ? base : `${base}, ${lowerFirst(substepLabel(substep, declared))}`
}
