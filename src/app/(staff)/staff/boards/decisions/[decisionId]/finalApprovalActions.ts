'use server'

import { z } from 'zod'
import { markLastMunicipalApproval } from '@/features/appeals/projectFinality'
import { civilDate, recordId } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { errorOrField } from '../../formFields'

const MARK_LAST_APPROVAL_FORM = z.object({
  decisionId: recordId('a decision'),
  approvedOn: civilDate('the date of the last municipal approval'),
})

export async function markLastApprovalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    MARK_LAST_APPROVAL_FORM,
    async ({ db, actor, signal }, input) => {
      const marked = await markLastMunicipalApproval(db, actor, input, signal)
      if (!marked.ok && marked.error === 'before_vote') {
        return refuseField('approvedOn', 'The date cannot be before the vote.')
      }
      return errorOrField(
        marked,
        'Marked as the last municipal approval. The appeal deadlines have started.',
        { future_date: 'approvedOn', already_final: 'approvedOn' },
      )
    },
  )
}
