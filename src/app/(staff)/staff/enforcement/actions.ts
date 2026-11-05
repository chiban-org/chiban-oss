'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Db } from '@/db/client'
import {
  ENFORCEMENT_STATUSES,
  type EnforcementStatus,
  NOTICE_METHODS,
  PROVISION_KINDS,
} from '@/db/schema'
import {
  findParcel,
  type ParcelLookupError,
  parcelForLocation,
  setCaseParcel,
} from '@/features/enforcement/caseParcel'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { recordFinding } from '@/features/enforcement/findings'
import { addNote } from '@/features/enforcement/notes'
import { recordNoticeReceipt, sendViolationNotice } from '@/features/enforcement/notices'
import {
  discardDraftOrder,
  draftOrder,
  issueOrder,
  reviseDraftOrder,
} from '@/features/enforcement/orders'
import {
  publishCase,
  setComplaintPublicText,
  unpublishCase,
} from '@/features/enforcement/publicText'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { ok, type Result } from '@/types/result'
import { runEnforcement } from './enforcementAction'
import { date, manyUuids, optional, uuid } from './fields'

async function parcelFor(
  db: Db,
  input: { parcelRef?: string | undefined; locationText: string },
  signal: AbortSignal,
): Promise<Result<string | undefined, ParcelLookupError>> {
  if (input.parcelRef === undefined) {
    return ok(await parcelForLocation(db, input.locationText, signal))
  }
  return await findParcel(db, input.parcelRef, signal)
}

export async function openCaseAction(formData: FormData): Promise<ActionResult> {
  const outcome: { caseId?: string } = {}
  const result = await runEnforcement(
    formData,
    z.object({ locationText: z.string().min(1), parcelRef: optional(z.string().trim().min(1)) }),
    async ({ db, actor, signal }, v) => {
      const parcel = await parcelFor(db, v, signal)
      if (!parcel.ok) return parcel
      const opened = await openCase(
        db,
        actor,
        {
          locationText: v.locationText,
          ...(parcel.value === undefined ? {} : { parcelId: parcel.value }),
        },
        signal,
      )
      if (opened.ok) outcome.caseId = opened.value.caseId
      return opened
    },
    'Case opened.',
  )
  if (result.ok && outcome.caseId !== undefined) redirect(`/staff/enforcement/${outcome.caseId}`)
  return result
}

export async function setCaseParcelAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ caseId: uuid, parcelRef: z.string().trim().min(1) }),
    ({ db, actor, signal }, v) => setCaseParcel(db, actor, v, signal),
    'Parcel linked.',
  )
}

export async function staffComplaintAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      locationText: z.string().min(1),
      description: z.string().min(1),
      parcelRef: optional(z.string().trim().min(1)),
    }),
    async ({ db, actor, signal }, v) => {
      const parcel = await parcelFor(db, v, signal)
      if (!parcel.ok) return parcel
      return await recordComplaint(
        db,
        actor,
        {
          channel: 'staff_entry',
          locationText: v.locationText,
          description: v.description,
          ...(parcel.value === undefined ? {} : { parcelId: parcel.value }),
        },
        signal,
      )
    },
    'Complaint recorded.',
  )
}

export async function setCaseStatusAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      to: z.enum(ENFORCEMENT_STATUSES),
      reason: optional(z.string()),
      expectedRowVersion: z.coerce.number().int(),
    }),
    ({ db, actor, signal }, v) =>
      setCaseStatus(
        db,
        actor,
        {
          caseId: v.caseId,
          to: v.to,
          expectedRowVersion: v.expectedRowVersion,
          ...(v.reason === undefined ? {} : { reason: v.reason }),
        },
        signal,
      ),
    'Status changed.',
  )
}

export async function addNoteAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ caseId: uuid, observedOn: date, body: z.string().min(1) }),
    ({ db, actor, signal }, v) => addNote(db, actor, v, signal),
    'Note added.',
  )
}

export async function recordFindingAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      provisionKind: z.enum(PROVISION_KINDS),
      provisionRef: z.string().min(1),
      facts: z.string().min(1),
      inspectionDate: date,
    }),
    ({ db, actor, signal }, v) => recordFinding(db, actor, v, signal),
    'Finding recorded.',
  )
}

export async function sendNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      findingIds: manyUuids,
      sentOn: date,
      method: z.enum(NOTICE_METHODS),
    }),
    ({ db, actor, signal }, v) => sendViolationNotice(db, getObjectStore(), actor, v, signal),
    'Notice of violation recorded.',
  )
}

export async function recordNoticeReceiptAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ noticeId: uuid, receivedOn: date, basis: z.string().min(1) }),
    ({ db, actor, signal }, v) => recordNoticeReceipt(db, actor, v, signal),
    'Receipt recorded.',
  )
}

export async function draftOrderAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      findingIds: manyUuids,
      correctiveAction: z.string(),
      correctiveDeadline: optional(date),
      ceaseImmediately: optional(z.string()),
    }),
    ({ db, actor, signal }, v) =>
      draftOrder(
        db,
        actor,
        {
          caseId: v.caseId,
          findingIds: v.findingIds,
          correctiveAction: v.correctiveAction,
          correctiveDeadline: v.correctiveDeadline ?? null,
          ceaseImmediately: v.ceaseImmediately === 'true',
        },
        signal,
      ),
    'Order drafted.',
  )
}

export async function reviseDraftOrderAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      orderId: uuid,
      expectedRowVersion: z.coerce.number().int(),
      correctiveAction: z.string(),
      correctiveDeadline: optional(date),
      ceaseImmediately: optional(z.string()),
    }),
    ({ db, actor, signal }, v) =>
      reviseDraftOrder(
        db,
        actor,
        {
          orderId: v.orderId,
          expectedRowVersion: v.expectedRowVersion,
          correctiveAction: v.correctiveAction,
          correctiveDeadline: v.correctiveDeadline ?? null,
          ceaseImmediately: v.ceaseImmediately === 'true',
        },
        signal,
      ),
    'Draft saved.',
  )
}

export async function discardDraftOrderAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ orderId: uuid, expectedRowVersion: z.coerce.number().int() }),
    ({ db, actor, signal }, v) => discardDraftOrder(db, actor, v, signal),
    'Draft discarded.',
  )
}

export async function issueOrderAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ orderId: uuid, issuedOn: date, expectedRowVersion: z.coerce.number().int() }),
    ({ db, actor, signal }, v) => issueOrder(db, getObjectStore(), actor, v, signal),
    'Order issued.',
  )
}

export async function complaintPublicTextAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ complaintId: uuid, text: z.string() }),
    ({ db, actor, signal }, v) => setComplaintPublicText(db, actor, v, signal),
    'Public text saved.',
  )
}

export async function publishCaseAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ caseId: uuid, summary: z.string() }),
    ({ db, actor, signal }, v) => publishCase(db, actor, v, signal),
    'The case is now public.',
  )
}

export async function unpublishCaseAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ caseId: uuid }),
    ({ db, actor, signal }, v) => unpublishCase(db, actor, v, signal),
    'The case is no longer public.',
  )
}
