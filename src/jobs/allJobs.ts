import { calendarPushJob } from './calendarPush'
import { clocksDailyJob } from './clocksDaily'
import type { JobDefinition } from './defineJob'
import { expireAliasOverridesJob } from './expireAliasOverrides'
import { exportsBuildJob, exportsPickupJob, exportsPruneJob } from './exportsBuild'
import { exportsIncrementalJob } from './exportsIncremental'
import { gisRefreshLayerJob, gisScheduleRefreshesJob } from './gisRefreshLayer'
import { healthCheckJob } from './healthCheck'
import { heartbeatJob } from './heartbeat'
import { notificationsSendJob } from './notificationsSend'
import { paymentsReconcileJob } from './paymentsReconcile'
import { recordsPreserveJob } from './recordsPreserve'
import { redactionRunJob } from './redactionRun'
import { renditionsDeriveJob } from './renditionsDerive'
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
  exportsIncrementalJob,
  healthCheckJob,
  jobsSweepJob,
  redactionRunJob,
  renditionsDeriveJob,
]
