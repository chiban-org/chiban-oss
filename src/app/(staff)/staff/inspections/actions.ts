'use server'

import { inspectorCalendars } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { requireCapability } from '@/features/authz/capabilities'
import { saveCalendarAccount } from '@/features/calendar/calendarAccounts'
import { issueCertificateOfOccupancy } from '@/features/certificates/issueCertificate'
import { publishConfig } from '@/features/config/publish'
import { fieldErrorsFor } from '@/features/config/publishErrors'
import { saveDraft } from '@/features/config/store'
import { inspectionErrorCopy } from '@/features/inspections/errorCopy'
import { parseAccountForm, parseCalendarForm } from '@/features/inspections/forms'
import { requestInspection } from '@/features/inspections/requestInspection'
import { cancelInspection, scheduleInspection } from '@/features/inspections/schedule'
import {
  CANCEL_FORM,
  certificateForm,
  SCHEDULE_FORM,
  STAFF_REQUEST_FORM,
} from '@/features/inspections/staffForms'
import { getObjectStore } from '@/features/storage/objectStore'
import { enqueueCalendarPushes } from '@/jobs/calendarPush'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { refusedDraft } from '../settings/draftRefusal'
import { SETTINGS_BODY_FORM } from '../settings/forms'

const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }

function failure(code: string): { ok: false; error: string } {
  return { ok: false, error: inspectionErrorCopy(code) }
}

function refused(code: string, field: string): ActionResult {
  return refuseField(field, inspectionErrorCopy(code))
}

export async function requestInspectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, STAFF_REQUEST_FORM, async ({ db, actor, signal }, input) => {
    const { preferredDate, contactPhone, accessNotes, reinspectionOf, ...rest } = input
    const made = await requestInspection(
      db,
      actor,
      {
        ...rest,
        ...(preferredDate === null ? {} : { preferredDate }),
        ...(contactPhone === null ? {} : { contactPhone }),
        ...(accessNotes === null ? {} : { accessNotes }),
        ...(reinspectionOf === null ? {} : { reinspectionOf }),
      },
      signal,
    )
    if (made.ok) return { ok: true, message: 'Request taken.' }
    return made.error === 'preferred_date_unavailable'
      ? refused(made.error, 'preferredDate')
      : failure(made.error)
  })
}

export async function scheduleInspectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SCHEDULE_FORM, async ({ db, actor, signal }, input) => {
    const { offGridReason, ...rest } = input
    const booked = await scheduleInspection(
      db,
      actor,
      { ...rest, ...(offGridReason === null ? {} : { offGrid: { reason: offGridReason } }) },
      signal,
    )
    if (!booked.ok) return failure(booked.error)
    await enqueueCalendarPushes(booked.value.pushIds, signal)
    return { ok: true, message: 'Scheduled. The inspector gets a calendar invite.' }
  })
}

export async function cancelInspectionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CANCEL_FORM, async ({ db, actor, signal }, input) => {
    const cancelled = await cancelInspection(db, actor, { ...input, reason: 'staff' }, signal)
    if (!cancelled.ok) return failure(cancelled.error)
    await enqueueCalendarPushes(cancelled.value.pushIds, signal)
    return { ok: true, message: 'Cancelled.' }
  })
}

export async function issueCertificateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    certificateForm,
    async ({ db, actor, signal }, input) => {
      const issued = await issueCertificateOfOccupancy(db, getObjectStore(), actor, input, signal)
      if (issued.ok) return { ok: true, message: `Certificate ${issued.value.number} issued.` }
      if (typeof issued.error === 'object') {
        return { ok: false, error: 'The permit cannot be closed yet. Check its open gates.' }
      }
      return issued.error === 'future_date'
        ? refused(issued.error, 'issuedOn')
        : failure(issued.error)
    },
  )
}

export async function saveInspectorCalendarAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const input = parseCalendarForm(formData)
    if (input === null) return INVALID
    const allowed = await requireCapability(db, actor.userId, 'config.edit', signal)
    if (!allowed.ok) return failure('forbidden')
    await db.transaction(async (tx) => {
      await tx
        .insert(inspectorCalendars)
        .values({
          userId: input.userId,
          kind: input.kind,
          email: input.email,
          graphUserId: input.graphUserId ?? null,
          updatedBy: actor.userId,
        })
        .onConflictDoUpdate({
          target: inspectorCalendars.userId,
          set: {
            kind: input.kind,
            email: input.email,
            graphUserId: input.graphUserId ?? null,
            updatedBy: actor.userId,
            updatedAt: new Date(),
          },
        })
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'inspector_calendar.save',
          entityType: 'user',
          entityId: input.userId,
          after: { kind: input.kind },
        },
        signal,
      )
    })
    return { ok: true, message: 'Calendar target saved.' }
  })
}

export async function saveCalendarAccountAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const input = parseAccountForm(formData)
    if (input === null) return INVALID
    const saved = await saveCalendarAccount(db, actor, input, signal)
    return saved.ok ? { ok: true, message: 'Tenant details saved.' } : failure(saved.error)
  })
}

export async function publishInspectionSettingsAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SETTINGS_BODY_FORM, async ({ db, actor, signal }, input) => {
    const saved = await saveDraft(
      db,
      actor,
      { kind: 'inspection_settings', key: 'default', body: input.body },
      signal,
    )
    if (!saved.ok) return refusedDraft(saved.error)
    const published = await publishConfig(db, actor, saved.value.versionId, signal)
    if (published.ok) return { ok: true, message: `Published version ${published.value.version}.` }
    return {
      ok: false,
      error: 'This version cannot be published yet.',
      fieldErrors: fieldErrorsFor(published.error),
    }
  })
}
