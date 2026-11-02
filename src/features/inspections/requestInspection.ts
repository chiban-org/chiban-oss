import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { applications, inspections } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { applicationVisibleTo } from '@/features/access/predicates'
import { isProjectParty } from '@/features/access/queries'
import { isSuspended } from '@/features/appeals/suspension'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { inspectableTypes } from '@/features/inspections/eligibility'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import { schedulingDates } from '@/features/inspections/slots'
import {
  PORTAL_PARTY_ROLES,
  type RequestInspectionError,
  type RequestInspectionInput,
} from '@/features/inspections/types'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export interface RequestDeps {
  now?: Date
}

async function checkReinspection(
  tx: Tx,
  input: RequestInspectionInput,
  inspectionType: string,
): Promise<RequestInspectionError | null> {
  if (input.reinspectionOf === undefined) return null
  const [previous] = await tx
    .select()
    .from(inspections)
    .where(eq(inspections.id, input.reinspectionOf))
  const sameRecord =
    previous?.applicationId === input.applicationId && previous.inspectionType === inspectionType
  if (!sameRecord || previous.status !== 'failed') return 'reinspection_not_failed'
  const followUps = await tx
    .select({ status: inspections.status })
    .from(inspections)
    .where(eq(inspections.reinspectionOf, previous.id))
  return followUps.some((r) => r.status === 'requested' || r.status === 'scheduled')
    ? 'reinspection_open'
    : null
}

export async function requestInspection(
  db: Db,
  actor: Actor,
  input: RequestInspectionInput,
  signal: AbortSignal,
  deps: RequestDeps = {},
): Promise<Result<{ inspectionId: string }, RequestInspectionError>> {
  signal.throwIfAborted()
  const now = deps.now ?? new Date()
  if (input.channel !== 'portal') {
    const allowed = await requireCapability(db, actor.userId, 'inspection.schedule', signal)
    if (!allowed.ok) return err('forbidden')
  }
  const [app] = await db
    .select({ id: applications.id, projectId: applications.projectId, state: applications.state })
    .from(applications)
    .where(and(eq(applications.id, input.applicationId), applicationVisibleTo(actor)))
  if (app === undefined) return err('not_found')
  if (input.channel === 'portal') {
    const party = await isProjectParty(db, actor, app.projectId, [...PORTAL_PARTY_ROLES], signal)
    if (!party) return err('not_found')
  }
  const settings = await getInspectionSettings(db, signal)
  if (input.channel === 'portal' && !settings.portalRequestsEnabled) {
    return err('portal_requests_disabled')
  }
  if (app.state === 'suspended' || (await isSuspended(db, app.id, signal))) {
    return err('permit_suspended')
  }
  if (app.state !== 'issued') return err('not_issued')
  const types = await inspectableTypes(db, app.id, signal)
  const type = types.find((t) => t.checklistVersionId === input.checklistVersionId)
  if (type === undefined) return err('not_a_pinned_checklist')
  if (input.preferredDate !== undefined) {
    const today = await townToday(db, now, signal)
    const open = schedulingDates(settings, packHolidayCalendar(), today)
    if (!open.includes(input.preferredDate)) return err('preferred_date_unavailable')
  }
  return await transactionResult<{ inspectionId: string }, RequestInspectionError>(
    db,
    async (tx) => {
      const blocked = await checkReinspection(tx, input, type.inspectionType)
      if (blocked !== null) return err(blocked)
      const [row] = await tx
        .insert(inspections)
        .values({
          applicationId: app.id,
          checklistVersionId: type.checklistVersionId,
          inspectionType: type.inspectionType,
          isFinal: type.final,
          channel: input.channel,
          requestedByUserId: actor.userId,
          preferredDate: input.preferredDate ?? null,
          contactName: input.contactName,
          contactPhone: input.contactPhone ?? null,
          accessNotes: input.accessNotes ?? null,
          reinspectionOf: input.reinspectionOf ?? null,
        })
        .returning({ id: inspections.id })
      const inspectionId = row?.id ?? ''
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'inspection.request',
          entityType: 'inspection',
          entityId: inspectionId,
          after: { applicationId: app.id, type: type.inspectionType, channel: input.channel },
        },
        signal,
      )
      return ok({ inspectionId })
    },
  )
}
