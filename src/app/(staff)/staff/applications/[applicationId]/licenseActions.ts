'use server'

import { z } from 'zod'
import { LICENSE_RESULTS } from '@/db/schema/licenseChecks'
import { choice, optionalText, requiredText } from '@/features/input/schemas'
import {
  type RecordLicenseCheckError,
  recordLicenseCheck,
} from '@/features/licenseChecks/recordLicenseCheck'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { applicationIdField } from './actionInput'

const LICENSE_CHECK_FORM = z.object({
  applicationId: applicationIdField(),
  licenseNumber: requiredText('the license number', { max: 100 }),
  licenseType: requiredText('the license type', { max: 100 }),
  result: choice('the result of the state lookup', LICENSE_RESULTS),
  note: optionalText('the note', { max: 500 }),
})

const REFUSAL_COPY: Readonly<Partial<Record<RecordLicenseCheckError, string>>> = {
  not_applicable:
    'This application does not need a state license check: it is not trade work done by a contractor.',
  application_closed: 'This application is closed, so no license check can be recorded on it.',
}

export async function recordLicenseCheckAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, LICENSE_CHECK_FORM, async ({ db, actor, signal }, input) => {
    const recorded = await recordLicenseCheck(db, actor, input, signal)
    if (!recorded.ok) {
      return { ok: false, error: REFUSAL_COPY[recorded.error] ?? errorCopy(recorded.error) }
    }
    return {
      ok: true,
      message:
        input.result === 'active'
          ? 'License check recorded. The license is active.'
          : 'License check recorded. The permit cannot be issued until a check finds the license active.',
    }
  })
}
