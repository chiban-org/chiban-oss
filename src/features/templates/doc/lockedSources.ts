export interface LockedSource {
  label: string
  reason: string
  style: 'paragraph' | 'notice'
  describe: string
}

const STATE_LAW = 'Required by state law'

export const LOCKED_SOURCES = {
  'decision.appealRights': {
    label: 'Appeal rights',
    reason: STATE_LAW,
    style: 'paragraph',
    describe: 'The appeal rights state law gives for this kind of application.',
  },
  'order.ceaseSentence': {
    label: 'Order to stop the activity now',
    reason: STATE_LAW,
    style: 'notice',
    describe: 'Printed only when the order says to stop the activity immediately.',
  },
  'order.motionNotice': {
    label: 'Notice of motion to enforce',
    reason: STATE_LAW,
    style: 'paragraph',
    describe: 'Printed when the order rule requires it.',
  },
  'order.lienWarning': {
    label: 'Lien warning',
    reason: STATE_LAW,
    style: 'paragraph',
    describe: 'Printed when the order rule requires it.',
  },
} as const satisfies Record<string, LockedSource>

export type LockedSourceKey = keyof typeof LOCKED_SOURCES

const BY_KEY: ReadonlyMap<string, LockedSource> = new Map(Object.entries(LOCKED_SOURCES))

export function isLockedSource(name: string): name is LockedSourceKey {
  return BY_KEY.has(name)
}

export function lockedSource(name: string): LockedSource | null {
  return BY_KEY.get(name) ?? null
}
