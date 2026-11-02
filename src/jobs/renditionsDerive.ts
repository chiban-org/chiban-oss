import { JOB_NAMES } from '@/constants/jobNames'
import { deriveRenditions } from '@/features/renditions/derive'
import { getObjectStore } from '@/features/storage/objectStore'
import { err, ok } from '@/types/result'
import { defineJob } from './defineJob'

interface DerivePayload {
  versionId: string
}

export const renditionsDeriveJob = defineJob<DerivePayload>({
  name: JOB_NAMES.RENDITIONS_DERIVE,
  dedupKey: (p) => `${JOB_NAMES.RENDITIONS_DERIVE}:${p.versionId}`,
  handler: async (payload, ctx) => {
    const derived = await deriveRenditions(ctx.db, getObjectStore(), payload.versionId, ctx.signal)
    if (derived.ok || derived.error === 'unsupported') return ok(undefined)
    return err(derived.error)
  },
})
