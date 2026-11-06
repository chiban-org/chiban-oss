'use server'

import { z } from 'zod'
import { requestExport } from '@/features/export/requestExport'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'

const EXPORT_COPY = {
  forbidden: errorCopy('forbidden'),
  export_running: 'An export is already being prepared. Wait for it to finish.',
} as const

const NO_FIELDS = z.object({})

export async function requestExportAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    NO_FIELDS,
    async ({ db, actor, signal }) => {
      const requested = await requestExport(db, actor, signal)
      if (!requested.ok) return { ok: false, error: EXPORT_COPY[requested.error] }
      return {
        ok: true,
        message: 'Export requested. It is ready in a few minutes. Reload this page to see it.',
      }
    },
    { exempt: 'export' },
  )
}
