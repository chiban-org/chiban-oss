import { appealsDailyJob } from './appealsDaily'
import { backupsScheduledJob } from './backupsScheduled'
import { calendarPushJob } from './calendarPush'
import { clocksDailyJob } from './clocksDaily'
import type { JobDefinition } from './defineJob'
import { expireAliasOverridesJob } from './expireAliasOverrides'
import { exportsBuildJob, exportsPickupJob, exportsPruneJob } from './exportsBuild'
import { exportsIncrementalJob } from './exportsIncremental'
import { filesDeleteJob, filesReleaseJob } from './filesRelease'
import { gisRefreshLayerJob, gisScheduleRefreshesJob } from './gisRefreshLayer'
import { healthCheckJob } from './healthCheck'
import { heartbeatJob } from './heartbeat'
import { notificationsSendJob } from './notificationsSend'
import { paymentsReconcileJob } from './paymentsReconcile'
import { recordsDisposeJob } from './recordsDispose'
import { recordsPreserveJob } from './recordsPreserve'
import { redactionRunJob } from './redactionRun'
import { renditionsDeriveJob } from './renditionsDerive'
import { reportsScheduledJob } from './reportsScheduled'
import { jobsSweepJob } from './sweep'

export const ALL_JOBS: JobDefinition<object>[] = [
  heartbeatJob,
  gisRefreshLayerJob,
  gisScheduleRefreshesJob,
  expireAliasOverridesJob,
  clocksDailyJob,
  appealsDailyJob,
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
  recordsDisposeJob,
  filesReleaseJob,
  filesDeleteJob,
  reportsScheduledJob,
  backupsScheduledJob,
]
