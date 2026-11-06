'use server'

import { z } from 'zod'
import {
  overrideAdministrativeGate,
  recordStatutoryException,
  revokeGateOverride,
} from '@/features/gates/overrides'
import { recordId, requiredText } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { applicationIdField, outcome } from './actionInput'

const MIN_REASON_LENGTH = 10

const OVERRIDE_FORM = z.object({
  applicationId: applicationIdField(),
  gateKey: requiredText('a gate', { max: 200 }),
  reason: requiredText('a reason', { min: MIN_REASON_LENGTH, max: 2000 }),
})

const EXCEPTION_FORM = z.object({
  applicationId: applicationIdField(),
  gateKey: requiredText('a gate', { max: 200 }),
  citation: requiredText('the legal citation', { max: 500 }),
  explanation: requiredText('the legal explanation', { max: 2000 }),
})

const REVOKE_FORM = z.object({ overrideId: recordId('an override') })

export async function overrideGateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, OVERRIDE_FORM, async ({ db, actor, signal }, input) =>
    outcome(
      await overrideAdministrativeGate(db, actor, input, signal),
      'Gate overridden. The reason is on record.',
      { reason_required: 'reason' },
    ),
  )
}

export async function statutoryExceptionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, EXCEPTION_FORM, async ({ db, actor, signal }, input) =>
    outcome(
      await recordStatutoryException(
        db,
        actor,
        {
          applicationId: input.applicationId,
          gateKey: input.gateKey,
          legalAuthority: { citation: input.citation, explanation: input.explanation },
        },
        signal,
      ),
      'Statutory exception recorded.',
      { authority_required: 'citation' },
    ),
  )
}

export async function revokeOverrideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REVOKE_FORM, async ({ db, actor, signal }, input) =>
    outcome(await revokeGateOverride(db, actor, input.overrideId, signal), 'Override revoked.'),
  )
}
