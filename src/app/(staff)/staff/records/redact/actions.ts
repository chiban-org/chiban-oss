'use server'

import { z } from 'zod'
import { env } from '@/config/env'
import { REDACTION_PURPOSES } from '@/db/schema'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { requestRedaction } from '@/features/redaction/redactionJobs'
import { runRedactionJob } from '@/features/redaction/runRedactionJob'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { optionalField, runRecords, uuidField } from '@/server/recordsAction'
import { err, ok } from '@/types/result'

const CONVERSION_TIMEOUT_MS = 120_000

const BoxesSchema = z
  .string()
  .min(2)
  .transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid boxes' })
      return z.NEVER
    }
  })
  .pipe(z.array(z.record(z.string(), z.unknown())).max(500))

export async function requestRedactionAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      documentId: uuidField,
      sourceVersionId: uuidField,
      purpose: z.enum(REDACTION_PURPOSES),
      rtkRequestId: optionalField(uuidField),
      boxes: BoxesSchema,
    }),
    async ({ db, actor, signal }, v) => {
      const requested = await requestRedaction(
        db,
        actor,
        {
          documentId: v.documentId,
          sourceVersionId: v.sourceVersionId,
          purpose: v.purpose,
          ...(v.rtkRequestId === undefined ? {} : { rtkRequestId: v.rtkRequestId }),
          boxes: v.boxes as never,
        },
        signal,
      )
      if (!requested.ok) return err(requested.error)
      const converter = createGhostscriptConverter({
        gsPath: env.GHOSTSCRIPT_PATH,
        iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
        timeoutMs: CONVERSION_TIMEOUT_MS,
      })
      const ran = await runRedactionJob(
        db,
        getObjectStore(),
        converter,
        { jobId: requested.value.jobId },
        signal,
      )
      if (!ran.ok || ran.value === 'failed') return err('redaction_failed')
      return ok(undefined)
    },
    'Redacted copy made. Review it, then approve it.',
  )
}
