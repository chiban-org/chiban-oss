import type { StartEvent } from '@/features/packs/schema'

export const AWAITING_FINAL_APPROVAL = 'after the project has its last municipal approval'
export const AWAITING_DECISION_FILED = 'after the written decision is filed'

const WAITING = new Map<StartEvent, string>([
  ['project_final_approval', AWAITING_FINAL_APPROVAL],
  ['decision_filed', AWAITING_DECISION_FILED],
])

export const WAITING_START_EVENTS: readonly StartEvent[] = [...WAITING.keys()]

export function waitingText(event: StartEvent): string | null {
  return WAITING.get(event) ?? null
}
