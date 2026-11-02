import { JOB_NAMES } from '@/constants/jobNames'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

export const heartbeatJob = defineJob<Record<string, never>>({
  name: JOB_NAMES.HEARTBEAT,
  intervalSeconds: 300,
  dedupKey: () => 'heartbeat',
  handler: () => Promise.resolve(ok(undefined)),
})
