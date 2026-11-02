export const JOB_NAMES = {
  HEARTBEAT: 'system.heartbeat',
  GIS_REFRESH_LAYER: 'gis.refreshLayer',
  GIS_SCHEDULE_REFRESHES: 'gis.scheduleRefreshes',
  EXPIRE_ALIAS_OVERRIDES: 'parcels.expireAliasOverrides',
  CLOCKS_DAILY: 'clocks.daily',
  PAYMENTS_RECONCILE: 'payments.reconcile',
  RECORDS_PRESERVE: 'records.preserve',
  NOTIFICATIONS_SEND: 'notifications.send',
  CALENDAR_PUSH: 'calendar.push',
  CALENDAR_SWEEP: 'calendar.sweep',
  EXPORTS_BUILD: 'exports.build',
  EXPORTS_PRUNE: 'exports.prune',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]
