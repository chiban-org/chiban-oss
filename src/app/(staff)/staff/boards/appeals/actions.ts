'use server'

import { redirect } from 'next/navigation'
import { recordAdministrativeDecision } from '@/features/appeals/adminAppeals'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { errorOrField } from '../formFields'
import { ADMINISTRATIVE_DECISION_FORM } from './forms'

export async function recordAdministrativeDecisionAction(
  formData: FormData,
): Promise<ActionResult> {
  const outcome: { applicationId?: string } = {}
  const result = await runStaffForm(
    formData,
    ADMINISTRATIVE_DECISION_FORM,
    async ({ db, actor, signal }, input) => {
      const recorded = await recordAdministrativeDecision(db, actor, input, signal)
      if (!recorded.ok && recorded.error === 'unknown_application')
        return refuseField('applicationNumber', 'No application or permit has that number.')
      if (recorded.ok) outcome.applicationId = recorded.value.applicationId
      return errorOrField(recorded, 'Administrative decision recorded.', {
        future_date: 'occurredOn',
      })
    },
  )
  if (result.ok && outcome.applicationId !== undefined)
    redirect(`/staff/boards/appeals/${outcome.applicationId}`)
  return result
}
