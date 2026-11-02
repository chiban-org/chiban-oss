export const JOB_NAMES = {
  HEARTBEAT: 'system.heartbeat',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]
