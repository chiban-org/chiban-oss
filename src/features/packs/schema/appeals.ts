import type { BoardKind } from '@/features/packs/schema/boards'

export const APPEAL_NODE_KINDS = [
  'administrative_decision',
  'zba_decision',
  'pb_decision',
  'zba_appeal',
  'rehearing_motion',
  'rehearing_outcome',
  'court_petition',
] as const
export type AppealNodeKind = (typeof APPEAL_NODE_KINDS)[number]

export interface AppealRouteWhen {
  outcome?: 'granted' | 'denied'
  linkedComponent?: boolean
  finalReviewBoard?: BoardKind
  label: string
}

export interface AppealRoute {
  from: AppealNodeKind
  when?: AppealRouteWhen
  to: AppealNodeKind
  windowRuleKey: string | null
  citation: { label: string; url: string }
}
