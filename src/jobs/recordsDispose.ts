import { JOB_NAMES } from '@/constants/jobNames'
import { executeDisposition } from '@/features/disposition/execute'
import { finishDisposition } from '@/features/files/releaseFile'
import { getObjectStore } from '@/features/storage/objectStore'
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
    if (!ran.ok && ran.error !== 'not_approved') return err(ran.error)
    await finishDisposition(ctx.root, getObjectStore(), payload.batchId, ctx.signal)
    return ok(undefined)
  },
})
