import { JOB_NAMES } from '@/constants/jobNames'
import { deleteQueuedFile, finishDisposition } from '@/features/files/releaseFile'
import { getObjectStore } from '@/features/storage/objectStore'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

export const filesReleaseJob = defineJob<{ batchId: string }>({
  name: JOB_NAMES.FILES_RELEASE,
  dedupKey: (p) => `${JOB_NAMES.FILES_RELEASE}:${p.batchId}`,
  handler: async (payload, ctx) => {
    await finishDisposition(ctx.root, getObjectStore(), payload.batchId, ctx.signal)
    return ok(undefined)
  },
})

export const filesDeleteJob = defineJob<{ sha256: string }>({
  name: JOB_NAMES.FILES_DELETE,
  dedupKey: (p) => `${JOB_NAMES.FILES_DELETE}:${p.sha256}`,
  handler: async (payload, ctx) => {
    await deleteQueuedFile(ctx.root, getObjectStore(), payload.sha256, ctx.signal)
    return ok(undefined)
  },
})
