import { env } from '@/config/env'
import { JOB_NAMES } from '@/constants/jobNames'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { runRedactionJob } from '@/features/redaction/runRedactionJob'
import { getObjectStore } from '@/features/storage/objectStore'
import { err, ok } from '@/types/result'
import { defineJob } from './defineJob'

const CONVERSION_TIMEOUT_MS = 120_000

interface RedactionRunPayload {
  jobId: string
}

const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: CONVERSION_TIMEOUT_MS,
})

export const redactionRunJob = defineJob<RedactionRunPayload>({
  name: JOB_NAMES.REDACTION_RUN,
  dedupKey: (p) => `${JOB_NAMES.REDACTION_RUN}:${p.jobId}`,
  handler: async (payload, ctx) => {
    const outcome = await runRedactionJob(
      ctx.db,
      getObjectStore(),
      converter,
      { jobId: payload.jobId },
      ctx.signal,
    )
    return outcome.ok ? ok(undefined) : err(outcome.error)
  },
})
