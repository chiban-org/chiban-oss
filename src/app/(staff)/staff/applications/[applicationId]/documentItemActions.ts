'use server'

import {
  ItemFileForm,
  ItemForm,
  ItemReasonForm,
  itemOutcome,
} from '@/features/applications/documentItemForms'
import {
  acceptWithoutDocument,
  linkDocument,
  requestWaiver,
  undoAcceptance,
  unlinkDocument,
  withdrawWaiver,
} from '@/features/applications/documentItems'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'

export async function staffLinkItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ItemFileForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await linkDocument(db, actor, input, signal), 'File assigned.'),
  )
}

export async function staffUnlinkItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ItemFileForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await unlinkDocument(db, actor, input, signal), 'File removed from this document.'),
  )
}

export async function acceptItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ItemReasonForm, async ({ db, actor, signal }, input) =>
    itemOutcome(
      await acceptWithoutDocument(db, actor, input, signal),
      'Accepted without the document.',
    ),
  )
}

export async function undoAcceptItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ItemForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await undoAcceptance(db, actor, input, signal), 'Acceptance undone.'),
  )
}

export async function staffRequestWaiverAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ItemReasonForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await requestWaiver(db, actor, input, signal), 'Waiver request recorded.'),
  )
}

export async function staffWithdrawWaiverAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ItemForm, async ({ db, actor, signal }, input) =>
    itemOutcome(await withdrawWaiver(db, actor, input, signal), 'Waiver request withdrawn.'),
  )
}
