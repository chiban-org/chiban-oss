'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { recordId, requiredText } from '@/features/input/schemas'
import { RETIRED_PARCEL_COPY, startApplication } from '@/features/portal/drafts'
import type { ActionResult } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

const START_COPY = {
  unknown_parcel: 'That parcel was not found.',
  retired_parcel: RETIRED_PARCEL_COPY,
  not_published: 'That kind of application is not available online.',
  config_inconsistent: 'That application is not ready yet. Ask the land use office.',
  forbidden: 'You cannot start this application.',
} as const

const fail = (error: string): ActionResult => ({ ok: false, error })

const StartForm = z.object({
  parcelId: recordId('a parcel'),
  typeKey: requiredText('an application type', { max: 100 }),
})

export async function startApplicationAction(formData: FormData): Promise<ActionResult> {
  const created = await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(StartForm, formData)
    if (!parsed.ok) return parsed.error
    const { parcelId, typeKey: applicationTypeKey } = parsed.value
    const started = await startApplication(db, actor, { parcelId, applicationTypeKey }, signal)
    return started.ok
      ? { ok: true as const, message: started.value.applicationId }
      : fail(START_COPY[started.error])
  })
  if (created.ok) redirect(`/portal/applications/${created.message}`)
  return created
}
