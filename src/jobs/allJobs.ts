import { calendarPushJob } from './calendarPush'
import { clocksDailyJob } from './clocksDaily'
import type { JobDefinition } from './defineJob'
import { expireAliasOverridesJob } from './expireAliasOverrides'
import { exportsBuildJob, exportsPickupJob, exportsPruneJob } from './exportsBuild'
import { gisRefreshLayerJob, gisScheduleRefreshesJob } from './gisRefreshLayer'
import { healthCheckJob } from './healthCheck'
import { heartbeatJob } from './heartbeat'
import { notificationsSendJob } from './notificationsSend'
import { paymentsReconcileJob } from './paymentsReconcile'
import { recordsPreserveJob } from './recordsPreserve'
import { jobsSweepJob } from './sweep'

export const ALL_JOBS: JobDefinition<object>[] = [
  heartbeatJob,
  gisRefreshLayerJob,
  gisScheduleRefreshesJob,
  expireAliasOverridesJob,
  clocksDailyJob,
  paymentsReconcileJob,
  recordsPreserveJob,
  notificationsSendJob,
  calendarPushJob,
  exportsBuildJob,
  exportsPickupJob,
  exportsPruneJob,
  healthCheckJob,
  jobsSweepJob,
]
