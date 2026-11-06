'use server'

import { z } from 'zod'
import { reassignCase } from '@/features/enforcement/caseAssignment'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import { recordId } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { settled } from './enforcementResult'

const REASSIGN_FORM = z.object({
  caseId: recordId('a case'),
  userId: optionalRecordId('Choose someone to assign.'),
})

const NOT_ELIGIBLE = 'Choose someone whose role works code enforcement cases.'

export async function reassignCaseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REASSIGN_FORM, async ({ db, actor, signal }, input) => {
    const reassigned = await reassignCase(db, actor, input, signal)
    if (!reassigned.ok && reassigned.error === 'not_eligible') {
      return refuseField('userId', NOT_ELIGIBLE)
    }
    return settled(reassigned, 'Case reassigned.')
  })
}
