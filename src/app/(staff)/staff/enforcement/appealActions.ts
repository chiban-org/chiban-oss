'use server'

import {
  certifyImminentPeril,
  dissolveRestrainingOrder,
  recordEnforcementAppeal,
  recordRestrainingOrder,
  resolveEnforcementAppeal,
} from '@/features/enforcement/appeals'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import {
  APPEAL_FORM,
  certifyPerilForm,
  dissolveRestrainingOrderForm,
  RESOLVE_APPEAL_FORM,
  restrainingOrderForm,
} from './appealForms'
import { settled } from './enforcementResult'

export async function appealAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, APPEAL_FORM, async ({ db, actor, signal }, input) =>
    settled(
      await recordEnforcementAppeal(db, actor, input, signal, new Date()),
      'Appeal recorded.',
      { date_in_future: 'filedOn', target_not_found: 'target' },
    ),
  )
}

export async function resolveAppealAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RESOLVE_APPEAL_FORM, async ({ db, actor, signal }, input) => {
    const resolved = await resolveEnforcementAppeal(db, actor, input, signal, new Date())
    if (!resolved.ok && resolved.error === 'invalid') {
      return refuseField('resolvedOn', 'The decision cannot be dated before the appeal was filed.')
    }
    return settled(resolved, 'Appeal resolved.', { date_in_future: 'resolvedOn' })
  })
}

export async function certifyPerilAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    certifyPerilForm,
    async ({ db, actor, signal }, input) => {
      const { category, ...rest } = input
      return settled(
        await certifyImminentPeril(db, actor, { ...rest, categories: [category] }, signal),
        'Imminent peril certified.',
      )
    },
  )
}

export async function restrainingOrderAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    restrainingOrderForm,
    async ({ db, actor, signal }, input) =>
      settled(
        await recordRestrainingOrder(db, actor, input, signal),
        'Restraining order recorded.',
        {
          proof_required: 'documentId',
        },
      ),
  )
}

export async function dissolveRestrainingOrderAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    dissolveRestrainingOrderForm,
    async ({ db, actor, signal }, input) =>
      settled(
        await dissolveRestrainingOrder(db, actor, input, signal),
        'Restraining order marked dissolved.',
      ),
  )
}
