import { JOB_NAMES } from '@/constants/jobNames'
import {
  cleanupAbandonedUploads,
  cleanupExpiredMagicLinks,
} from '@/features/documents/cleanupUploads'
import { getObjectStore } from '@/features/storage/objectStore'
import { ok } from '@/types/result'
import { defineJob } from './defineJob'

const HOUR_SECONDS = 3600
const HOUR_CHARS = 13

export const uploadsCleanupJob = defineJob<{ at?: string }>({
  name: JOB_NAMES.UPLOADS_CLEANUP,
  intervalSeconds: HOUR_SECONDS,
  dedupKey: (p) =>
    `${JOB_NAMES.UPLOADS_CLEANUP}:${(p.at ?? new Date().toISOString()).slice(0, HOUR_CHARS)}`,
  handler: async (_payload, ctx) => {
    const now = new Date()
    await cleanupAbandonedUploads(ctx.root, getObjectStore(), now, ctx.signal)
    await cleanupExpiredMagicLinks(ctx.root, now)
    return ok(undefined)
  },
})
