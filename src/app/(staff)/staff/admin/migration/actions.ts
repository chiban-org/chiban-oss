'use server'

import { publishMigrationBatch } from '@/features/migration/publishBatch'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

const PUBLISH_COPY = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_staged: 'This batch has not been run, or it has already been published.',
} as const

export async function publishMigrationBatchAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const published = await publishMigrationBatch(db, actor, text(formData, 'batchId'), signal)
    if (!published.ok) return { ok: false, error: PUBLISH_COPY[published.error] }
    return {
      ok: true,
      message: `Published ${published.value.published} files. Files whose parcel was not found stay private.`,
    }
  })
}
