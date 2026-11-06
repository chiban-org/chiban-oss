'use server'

import { inspectionErrorCopy } from '@/features/inspections/errorCopy'
import { parseCancelForm } from '@/features/inspections/forms'
import { PortalRequestForm, portalRequestInput } from '@/features/inspections/portalRequestForm'
import { requestInspection } from '@/features/inspections/requestInspection'
import { cancelInspection } from '@/features/inspections/schedule'
import { enqueueCalendarPushes } from '@/jobs/calendarPush'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

const fail = (error: string): ActionResult => ({ ok: false, error })

export async function portalRequestInspectionAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(PortalRequestForm, formData)
    if (!parsed.ok) return parsed.error
    const made = await requestInspection(db, actor, portalRequestInput(parsed.value), signal)
    if (!made.ok) return fail(inspectionErrorCopy(made.error))
    return { ok: true, message: 'Request sent. The land use office will schedule it.' }
  })
}

export async function portalCancelInspectionAction(formData: FormData): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const input = parseCancelForm(formData)
    if (input === null) return fail(errorCopy('invalid_input'))
    const cancelled = await cancelInspection(db, actor, { ...input, reason: 'requester' }, signal)
    if (!cancelled.ok) return fail(inspectionErrorCopy(cancelled.error))
    await enqueueCalendarPushes(cancelled.value.pushIds, signal)
    return { ok: true, message: 'Request cancelled.' }
  })
}
