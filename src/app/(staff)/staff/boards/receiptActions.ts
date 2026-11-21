'use server'

import { setApplicationMunicipalities } from '@/features/boards/applicationMunicipalities'
import { recordSourceWaterDetermination } from '@/features/boards/sourceWater'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { errorOrField } from './formFields'
import { MUNICIPALITIES_FORM, PREPARE_RECEIPT_FORM, SOURCE_WATER_FORM } from './receiptForms'

export async function prepareReceiptNoticesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    PREPARE_RECEIPT_FORM,
    async ({ db, actor, signal }, input) => {
      const prepared = await prepareReceiptNotices(db, actor, input, signal)
      if (!prepared.ok && prepared.error === 'no_issued_list') {
        return { ok: false, error: 'Issue the abutter list before preparing the receipt notices.' }
      }
      return errorOrField(prepared, 'Receipt notices prepared. Record proof for each recipient.')
    },
  )
}

export async function sourceWaterDeterminationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SOURCE_WATER_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await recordSourceWaterDetermination(db, actor, input, signal),
      'Source water protection area determination recorded. Draw and issue a new list.',
      { supplier_required: 'supplierKey', unknown_supplier: 'supplierKey' },
    ),
  )
}

export async function applicationMunicipalitiesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MUNICIPALITIES_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await setApplicationMunicipalities(
        db,
        actor,
        {
          applicationId: input.applicationId,
          municipalities: [
            ...input.abuttingKeys.map((key) => ({ key, relation: 'abutting' as const })),
            ...input.includedKeys.map((key) => ({ key, relation: 'includes' as const })),
          ],
        },
        signal,
      ),
      'Municipalities recorded.',
      { unknown_municipality: 'abuttingKeys' },
    ),
  )
}
