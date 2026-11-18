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

export interface AppealRoute {
  from: AppealNodeKind
  when?: string
  to: AppealNodeKind
  windowRuleKey: string | null
  citation: { label: string; url: string }
}
