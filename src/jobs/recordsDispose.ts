import { JOB_NAMES } from '@/constants/jobNames'
import { executeDisposition } from '@/features/disposition/execute'
import { err, ok } from '@/types/result'
import { defineJob } from './defineJob'

interface DisposePayload {
  batchId: string
}

export const recordsDisposeJob = defineJob<DisposePayload>({
  name: JOB_NAMES.RECORDS_DISPOSE,
  dedupKey: (p) => `${JOB_NAMES.RECORDS_DISPOSE}:${p.batchId}`,
  handler: async (payload, ctx) => {
    const ran = await executeDisposition(ctx.root, { batchId: payload.batchId }, ctx.signal)
    return ran.ok || ran.error === 'not_approved' ? ok(undefined) : err(ran.error)
  },
})
