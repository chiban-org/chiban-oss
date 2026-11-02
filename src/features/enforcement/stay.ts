export interface StayState {
  stayed: boolean
  reason: 'appeal_pending' | 'restraining_order' | null
  appealId: string | null
}

export const NOT_STAYED: StayState = { stayed: false, reason: null, appealId: null }
