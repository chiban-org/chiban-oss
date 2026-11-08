'use server'

import { saveContractorProfile, savePersonDetails } from '@/features/contractors/profile'
import { ContractorForm, PersonForm } from '@/features/contractors/profileForm'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

const fail = (error: string): ActionResult => ({ ok: false, error })

function linkedCopy(created: boolean, linked: number): string {
  const opening = created
    ? 'Your contractor profile is set up.'
    : 'Your contractor profile is saved.'
  if (linked === 0) return opening
  const projects =
    linked === 1 ? 'One project naming your email was' : `${linked} projects naming your email were`
  return `${opening} ${projects} added to your contractor projects.`
}

export async function savePersonAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(PersonForm, formData)
    if (!parsed.ok) return parsed.error
    const saved = await savePersonDetails(db, actor, parsed.value, signal)
    return saved.ok
      ? { ok: true, message: 'Your details are saved.' }
      : fail(errorCopy('forbidden'))
  })
}

export async function saveContractorAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(ContractorForm, formData)
    if (!parsed.ok) return parsed.error
    const saved = await saveContractorProfile(db, actor, parsed.value, signal)
    if (!saved.ok) return fail(errorCopy('forbidden'))
    return { ok: true, message: linkedCopy(saved.value.created, saved.value.linkedParties) }
  })
}
