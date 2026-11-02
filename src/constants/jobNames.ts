export const JOB_NAMES = {
  HEARTBEAT: 'system.heartbeat',
  GIS_REFRESH_LAYER: 'gis.refreshLayer',
  GIS_SCHEDULE_REFRESHES: 'gis.scheduleRefreshes',
  EXPIRE_ALIAS_OVERRIDES: 'parcels.expireAliasOverrides',
  CLOCKS_DAILY: 'clocks.daily',
  PAYMENTS_RECONCILE: 'payments.reconcile',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]
