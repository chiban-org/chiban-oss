export const JOB_NAMES = {
  HEARTBEAT: 'system.heartbeat',
  GIS_REFRESH_LAYER: 'gis.refreshLayer',
  GIS_SCHEDULE_REFRESHES: 'gis.scheduleRefreshes',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]
