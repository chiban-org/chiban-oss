'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { HELD_PARCEL_COPY } from '@/features/enforcement/holdCopy'
import { recordId, requiredText } from '@/features/input/schemas'
import { loadTownProfile } from '@/features/pdf/documentFrame'
import { RETIRED_PARCEL_COPY, startApplication } from '@/features/portal/drafts'
import type { ActionResult } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

function startCopy(officeName: string) {
  return {
    unknown_parcel: 'That parcel was not found.',
    retired_parcel: RETIRED_PARCEL_COPY,
    parcel_held: HELD_PARCEL_COPY,
    not_published: 'That kind of application is not available online.',
    config_inconsistent: `That application is not ready yet. Ask the ${officeName}.`,
    forbidden: 'You cannot start this application.',
  } as const
}

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
    if (started.ok) return { ok: true as const, message: started.value.applicationId }
    const office = (await loadTownProfile(db, signal))?.officeName ?? 'land use office'
    return fail(startCopy(office)[started.error])
  })
  if (created.ok) redirect(`/portal/applications/${created.message}`)
  return created
}
