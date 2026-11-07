'use server'

import { z } from 'zod'
import { recordId } from '@/features/input/schemas'
import { publishMigrationBatch } from '@/features/migration/publishBatch'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'

const PUBLISH_FORM = z.object({ batchId: recordId('a batch') })

const PUBLISH_COPY = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_staged: 'This batch has not been run, or it has already been shown on the public site.',
} as const

export async function publishMigrationBatchAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PUBLISH_FORM, async ({ db, actor, signal }, { batchId }) => {
    const published = await publishMigrationBatch(db, actor, batchId, signal)
    if (!published.ok) return { ok: false, error: PUBLISH_COPY[published.error] }
    return {
      ok: true,
      message: `Showed ${published.value.published} files on the public site. Files whose parcel was not found stay private.`,
    }
  })
}
