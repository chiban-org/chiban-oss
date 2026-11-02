import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { canViewApplication, isProjectParty } from '@/features/access/queries'
import { isSuspended } from '@/features/appeals/suspension'
import type { Actor } from '@/features/auth/actor'
import { inspectableTypes } from '@/features/inspections/eligibility'
import { type InspectionHistoryRow, listInspectionHistory } from '@/features/inspections/history'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import { reinspectableFailureIds } from '@/features/inspections/lookup'
import { describePhoneHours } from '@/features/inspections/phoneHours'
import { schedulingDates } from '@/features/inspections/slots'
import { PORTAL_PARTY_ROLES } from '@/features/inspections/types'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export interface PortalInspectionsView {
  applicationId: string
  number: string
  paused: boolean
  requestsEnabled: boolean
  canRequest: boolean
  types: { checklistVersionId: string; label: string }[]
  dates: string[]
  phoneHoursText: string
  history: InspectionHistoryRow[]
  reinspectableIds: string[]
}

export async function loadPortalInspections(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<PortalInspectionsView, 'not_found'>> {
  signal.throwIfAborted()
  if (!(await canViewApplication(db, actor, applicationId, signal))) return err('not_found')
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId))
  if (app === undefined) return err('not_found')
  const party = await isProjectParty(db, actor, app.projectId, [...PORTAL_PARTY_ROLES], signal)
  const settings = await getInspectionSettings(db, signal)
  const today = await townToday(db, now, signal)
  const paused = app.state === 'suspended' || (await isSuspended(db, applicationId, signal))
  const issued = app.state === 'issued'
  const types = await inspectableTypes(db, applicationId, signal)
  return ok({
    applicationId,
    number: app.number,
    paused,
    requestsEnabled: settings.portalRequestsEnabled,
    canRequest: party && issued && !paused && settings.portalRequestsEnabled,
    types: types.map((t) => ({ checklistVersionId: t.checklistVersionId, label: t.label })),
    dates: schedulingDates(settings, packHolidayCalendar(), today),
    phoneHoursText: describePhoneHours(settings),
    history: await listInspectionHistory(db, actor, applicationId, signal),
    reinspectableIds: [...(await reinspectableFailureIds(db, applicationId))],
  })
}
