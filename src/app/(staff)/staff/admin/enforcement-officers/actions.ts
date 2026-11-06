'use server'

import {
  designateEnforcementOfficer,
  endEnforcementDesignation,
  updateEnforcementDesignation,
} from '@/features/enforcement/designations'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import type { Result } from '@/types/result'
import { designateForm, END_FORM, updateForm } from './forms'

const COPY = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  already_ended: 'That designation has already ended.',
  invalid: errorCopy('invalid_input'),
} as const

function done(
  result: Result<unknown, keyof typeof COPY>,
  message: string,
  invalidField?: { field: string; message: string },
): ActionResult {
  if (result.ok) return { ok: true, message }
  if (result.error === 'invalid' && invalidField !== undefined) {
    return refuseField(invalidField.field, invalidField.message)
  }
  return { ok: false, error: COPY[result.error] }
}

export async function designateOfficerAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, designateForm, async ({ db, actor, signal }, input) =>
    done(await designateEnforcementOfficer(db, actor, input, signal), 'Officer designated.'),
  )
}

export async function endDesignationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, END_FORM, async ({ db, actor, signal }, input) =>
    done(await endEnforcementDesignation(db, actor, input, signal), 'Designation ended.', {
      field: 'endedOn',
      message: 'The last day cannot be before the date the designation was adopted.',
    }),
  )
}

export async function updateDesignationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, updateForm, async ({ db, actor, signal }, input) =>
    done(await updateEnforcementDesignation(db, actor, input, signal), 'Designation saved.', {
      field: 'adoptedOn',
      message: 'The date adopted cannot be after the day the designation ended.',
    }),
  )
}
