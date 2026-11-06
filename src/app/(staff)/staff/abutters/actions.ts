'use server'

import { issueList } from '@/features/abutters/issue'
import {
  attestCrossings,
  correctRecipient,
  decideTenant,
  excludeCandidate,
  generateList,
  selectParcel,
} from '@/features/abutters/lists'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { addProfessional } from '@/features/rosters/professionals'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import {
  ADD_PROFESSIONAL_FORM,
  CORRECT_RECIPIENT_FORM,
  DECIDE_TENANT_FORM,
  EXCLUDE_CANDIDATE_FORM,
  GENERATE_LIST_FORM,
  LIST_ONLY_FORM,
  SELECT_PARCEL_FORM,
} from './abutterForms'

type FieldOf = Readonly<Record<string, string>>

function settled(
  result: { ok: true } | { ok: false; error: unknown },
  message: string,
  fieldOf: FieldOf = {},
): ActionResult {
  if (result.ok) return { ok: true, message }
  const copy = boardErrorCopy(result.error)
  const field = typeof result.error === 'string' ? fieldOf[result.error] : undefined
  return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
}

export async function generateListAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, GENERATE_LIST_FORM, async ({ db, actor, signal }, input) => {
    const made = await generateList(db, actor, input, signal)
    return made.ok
      ? { ok: true, message: `Draft list version ${made.value.version} drawn.` }
      : settled(made, '')
  })
}

export async function selectParcelAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    SELECT_PARCEL_FORM,
    async ({ db, actor, signal }, { parcelRef, ...input }) => {
      const found = await resolveParcelId(db, { value: parcelRef }, signal)
      if (!found.ok) return refuseField('parcelRef', boardErrorCopy('unknown_parcel'))
      const selected = await selectParcel(
        db,
        actor,
        { ...input, parcelId: found.value.parcelId },
        signal,
      )
      return settled(selected, 'Parcel added to the list.', { note_required: 'note' })
    },
  )
}

export async function excludeCandidateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    EXCLUDE_CANDIDATE_FORM,
    async ({ db, actor, signal }, input) =>
      settled(await excludeCandidate(db, actor, input, signal), 'Parcel left off the list.', {
        reason_required: 'reason',
      }),
  )
}

export async function correctRecipientAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    CORRECT_RECIPIENT_FORM,
    async ({ db, actor, signal }, input) =>
      settled(await correctRecipient(db, actor, input, signal), 'Name and address updated.', {
        reason_required: 'reason',
      }),
  )
}

export async function decideTenantAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DECIDE_TENANT_FORM, async ({ db, actor, signal }, input) =>
    settled(await decideTenant(db, actor, input, signal), 'Decision recorded.', {
      reason_required: 'reason',
    }),
  )
}

export async function attestCrossingsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, LIST_ONLY_FORM, async ({ db, actor, signal }, input) =>
    settled(
      await attestCrossings(db, actor, input, signal),
      'Recorded: streets and streams were reviewed.',
    ),
  )
}

export async function issueListAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, LIST_ONLY_FORM, async ({ db, actor, signal }, input) =>
    settled(
      await issueList(db, actor, input, signal),
      'List issued. Notice costs were calculated from it.',
    ),
  )
}

export async function addProfessionalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ADD_PROFESSIONAL_FORM, async ({ db, actor, signal }, input) =>
    settled(await addProfessional(db, actor, input, signal), 'Professional added.', {
      name_required: 'name',
      address_required: 'businessAddress',
    }),
  )
}
