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
import { errorOrOk } from '@/features/boards/actionResult'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { addProfessional } from '@/features/rosters/professionals'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const PROFESSIONS = ['engineer', 'architect', 'land_surveyor', 'soil_scientist'] as const

export async function generateListAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const made = await generateList(
      db,
      actor,
      { applicationId: text(formData, 'applicationId') },
      signal,
    )
    return made.ok
      ? { ok: true, message: `Draft list version ${made.value.version} drawn.` }
      : { ok: false, error: boardErrorCopy(made.error) }
  })
}

export async function selectParcelAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const found = await resolveParcelId(db, { value: text(formData, 'parcelRef') }, signal)
    if (!found.ok) return { ok: false, error: boardErrorCopy('unknown_parcel') }
    const crossing = text(formData, 'crossing') === 'stream' ? 'stream' : 'street'
    const selected = await selectParcel(
      db,
      actor,
      {
        listId: text(formData, 'listId'),
        parcelId: found.value.parcelId,
        crossing,
        note: text(formData, 'note'),
      },
      signal,
    )
    return errorOrOk(selected, 'Parcel added to the list.')
  })
}

export async function excludeCandidateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const excluded = await excludeCandidate(
      db,
      actor,
      {
        listId: text(formData, 'listId'),
        parcelId: text(formData, 'parcelId'),
        reason: text(formData, 'reason'),
      },
      signal,
    )
    return errorOrOk(excluded, 'Parcel left off the list.')
  })
}

export async function correctRecipientAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const corrected = await correctRecipient(
      db,
      actor,
      {
        listId: text(formData, 'listId'),
        recipientId: text(formData, 'recipientId'),
        name: text(formData, 'name'),
        mailingAddress: text(formData, 'mailingAddress'),
        reason: text(formData, 'reason'),
      },
      signal,
    )
    return errorOrOk(corrected, 'Name and address updated.')
  })
}

export async function decideTenantAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const decided = await decideTenant(
      db,
      actor,
      {
        listId: text(formData, 'listId'),
        recipientId: text(formData, 'recipientId'),
        qualifies: text(formData, 'qualifies') === 'yes',
        reason: text(formData, 'reason'),
      },
      signal,
    )
    return errorOrOk(decided, 'Decision recorded.')
  })
}

export async function attestCrossingsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const attested = await attestCrossings(db, actor, { listId: text(formData, 'listId') }, signal)
    return errorOrOk(attested, 'Recorded: streets and streams were reviewed.')
  })
}

export async function issueListAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const issued = await issueList(db, actor, { listId: text(formData, 'listId') }, signal)
    return errorOrOk(issued, 'List issued. Notice costs were calculated from it.')
  })
}

export async function addProfessionalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const profession = text(formData, 'profession')
    if (!(PROFESSIONS as readonly string[]).includes(profession)) return INVALID
    const added = await addProfessional(
      db,
      actor,
      {
        applicationId: text(formData, 'applicationId'),
        name: text(formData, 'name'),
        profession: profession as (typeof PROFESSIONS)[number],
        businessAddress: text(formData, 'businessAddress'),
        sealOnPlat: text(formData, 'sealOnPlat') === 'yes',
      },
      signal,
    )
    return errorOrOk(added, 'Professional added.')
  })
}
