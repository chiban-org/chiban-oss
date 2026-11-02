'use server'

import { z } from 'zod'
import {
  ENFORCEMENT_STATUSES,
  type EnforcementStatus,
  NOTICE_METHODS,
  PROVISION_KINDS,
} from '@/db/schema'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { recordFinding } from '@/features/enforcement/findings'
import { addNote } from '@/features/enforcement/notes'
import { recordNoticeReceipt, sendViolationNotice } from '@/features/enforcement/notices'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import {
  publishCase,
  setComplaintPublicText,
  unpublishCase,
} from '@/features/enforcement/publicText'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runEnforcement } from './enforcementAction'
import { date, manyUuids, optional, uuid } from './fields'

export async function openCaseAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ locationText: z.string().min(1), parcelId: optional(uuid) }),
    ({ db, actor, signal }, v) =>
      openCase(
        db,
        actor,
        {
          locationText: v.locationText,
          ...(v.parcelId === undefined ? {} : { parcelId: v.parcelId }),
        },
        signal,
      ),
    'Case opened.',
  )
}

export async function staffComplaintAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ locationText: z.string().min(1), description: z.string().min(1) }),
    ({ db, actor, signal }, v) =>
      recordComplaint(
        db,
        actor,
        { channel: 'staff_entry', locationText: v.locationText, description: v.description },
        signal,
      ),
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
          to: v.to as EnforcementStatus,
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
