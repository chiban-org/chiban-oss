'use server'

import {
  placeDevelopmentHold,
  recordCivilAction,
  releaseDevelopmentHold,
  revokePermitUnderHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffFormToday } from '@/server/formInputToday'
import { settled } from './enforcementResult'
import { civilActionForm, holdPermitForm, placeHoldForm, releaseHoldForm } from './holdForms'

export async function placeDevelopmentHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, placeHoldForm, async ({ db, actor, signal }, input) =>
    settled(await placeDevelopmentHold(db, actor, input, signal), 'Development hold placed.', {
      cure_not_lapsed: 'placedOn',
    }),
  )
}

export async function releaseDevelopmentHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, releaseHoldForm, async ({ db, actor, signal }, input) =>
    settled(await releaseDevelopmentHold(db, actor, input, signal), 'Development hold released.', {
      before_placed: 'releasedOn',
      before_suspension: 'releasedOn',
    }),
  )
}

export async function suspendUnderHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, holdPermitForm, async ({ db, actor, signal }, input) =>
    settled(await suspendPermitUnderHold(db, actor, input, signal), 'Permit suspended.', {
      before_placed: 'actedOn',
      before_reinstatement: 'actedOn',
    }),
  )
}

export async function revokeUnderHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, holdPermitForm, async ({ db, actor, signal }, input) =>
    settled(await revokePermitUnderHold(db, actor, input, signal), 'Permit revoked.', {
      before_placed: 'actedOn',
      before_reinstatement: 'actedOn',
      before_suspension: 'actedOn',
    }),
  )
}

export async function recordCivilActionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, civilActionForm, async ({ db, actor, signal }, input) =>
    settled(await recordCivilAction(db, actor, input, signal), 'Civil action recorded.', {
      cure_not_lapsed: 'filedOn',
    }),
  )
}
