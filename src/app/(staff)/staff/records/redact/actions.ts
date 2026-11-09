'use server'

import { env } from '@/config/env'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { requestRedaction } from '@/features/redaction/redactionJobs'
import { runRedactionJob } from '@/features/redaction/runRedactionJob'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { recordsOutcome } from '@/server/recordsAction'
import { err } from '@/types/result'
import { REDACT_FORM } from './redactForm'

const CONVERSION_TIMEOUT_MS = 120_000

const BOX_ERRORS = {
  no_boxes: 'boxes',
  unknown_exemption: 'boxes',
  citation_required: 'boxes',
  explanation_required: 'boxes',
}

export async function requestRedactionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REDACT_FORM, async ({ db, actor, signal }, input) => {
    const requested = await requestRedaction(
      db,
      actor,
      {
        documentId: input.documentId,
        sourceVersionId: input.sourceVersionId,
        purpose: input.purpose,
        ...(input.rtkRequestId === null ? {} : { rtkRequestId: input.rtkRequestId }),
        boxes: input.boxes as never,
      },
      signal,
    )
    if (!requested.ok) return recordsOutcome(requested, '', BOX_ERRORS)
    const converter = createGhostscriptConverter({
      gsPath: env.GHOSTSCRIPT_PATH,
      iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
      timeoutMs: CONVERSION_TIMEOUT_MS,
      veraPdfPath: env.VERAPDF_PATH,
    })
    const ran = await runRedactionJob(
      db,
      getObjectStore(),
      converter,
      { jobId: requested.value.jobId },
      signal,
    )
    if (!ran.ok || ran.value === 'failed') return recordsOutcome(err('redaction_failed'), '')
    return {
      ok: true,
      message:
        'Redacted copy made. Nothing is released or public until it is approved, as described below.',
    }
  })
}
