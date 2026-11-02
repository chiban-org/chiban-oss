'use server'

import { redirect } from 'next/navigation'
import { startApplication } from '@/features/portal/drafts'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { withPortalActor } from '@/server/portalAction'
import { isUuid } from '@/utils/uuid'

const START_COPY = {
  unknown_parcel: 'That parcel was not found.',
  not_published: 'That kind of application is not available online.',
  config_inconsistent: 'That application is not ready yet. Ask the land use office.',
  forbidden: 'You cannot start this application.',
} as const

const fail = (error: string): ActionResult => ({ ok: false, error })

export async function startApplicationAction(formData: FormData): Promise<ActionResult> {
  const created = await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parcelId = text(formData, 'parcelId')
    const applicationTypeKey = text(formData, 'typeKey')
    if (!isUuid(parcelId) || applicationTypeKey === '') return fail(errorCopy('invalid_input'))
    const started = await startApplication(db, actor, { parcelId, applicationTypeKey }, signal)
    return started.ok
      ? { ok: true as const, message: started.value.applicationId }
      : fail(START_COPY[started.error])
  })
  if (created.ok) redirect(`/portal/applications/${created.message}`)
  return created
}
