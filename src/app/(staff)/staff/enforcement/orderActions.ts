'use server'

import {
  discardDraftOrder,
  draftOrder,
  issueOrder,
  reviseDraftOrder,
} from '@/features/enforcement/orders'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { settled } from './enforcementResult'
import {
  DISCARD_DRAFT_ORDER_FORM,
  DRAFT_ORDER_FORM,
  issueOrderForm,
  REVISE_DRAFT_ORDER_FORM,
} from './orderForms'

export async function draftOrderAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DRAFT_ORDER_FORM, async ({ db, actor, signal }, input) =>
    settled(
      await draftOrder(
        db,
        actor,
        { ...input, correctiveAction: input.correctiveAction ?? '' },
        signal,
      ),
      'Order drafted.',
      { findings_invalid: 'findingIds', split_required: 'findingIds' },
    ),
  )
}

export async function reviseDraftOrderAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    REVISE_DRAFT_ORDER_FORM,
    async ({ db, actor, signal }, input) =>
      settled(
        await reviseDraftOrder(
          db,
          actor,
          { ...input, correctiveAction: input.correctiveAction ?? '' },
          signal,
        ),
        'Draft saved.',
      ),
  )
}

export async function discardDraftOrderAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    DISCARD_DRAFT_ORDER_FORM,
    async ({ db, actor, signal }, input) =>
      settled(await discardDraftOrder(db, actor, input, signal), 'Draft discarded.'),
  )
}

export async function issueOrderAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, issueOrderForm, async ({ db, actor, signal }, input) =>
    settled(await issueOrder(db, getObjectStore(), actor, input, signal), 'Order issued.', {
      not_designated: 'issuedOn',
      deadline_before_issue: 'issuedOn',
    }),
  )
}
