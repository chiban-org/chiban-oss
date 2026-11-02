'use server'

import { RECIPIENT_ROLES } from '@packs/nh/schema'
import { z } from 'zod'
import { COURT_STEP_KINDS, JUDGMENT_OUTCOMES, SERVER_ROLES, SERVICE_METHODS } from '@/db/schema'
import { recordAnswer } from '@/features/enforcement/answers'
import { recordCourtStep } from '@/features/enforcement/courtSteps'
import { listRecipient, recordRoleCheck, recordServiceEvent } from '@/features/enforcement/service'
import type { ActionResult } from '@/server/actionRunner'
import { runEnforcement } from './enforcementAction'
import { date, optional, uuid } from './fields'

export async function listRecipientAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      orderId: uuid,
      role: z.enum(RECIPIENT_ROLES),
      name: z.string().min(1),
      address: z.string().min(1),
      source: z.string().min(1),
    }),
    ({ db, actor, signal }, v) => listRecipient(db, actor, v, signal),
    'Recipient added.',
  )
}

export async function roleCheckAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      orderId: uuid,
      role: z.enum(RECIPIENT_ROLES),
      outcome: z.enum(['recipients_listed', 'none_exist', 'same_as_owner', 'owner_not_found']),
      basis: z.string().min(1),
      checkedOn: date,
    }),
    ({ db, actor, signal }, v) => recordRoleCheck(db, actor, v, signal),
    'Check recorded.',
  )
}

export async function serviceEventAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      orderId: uuid,
      recipientId: optional(uuid),
      method: z.enum(SERVICE_METHODS),
      servedOn: date,
      serverName: optional(z.string()),
      serverRole: optional(z.enum(SERVER_ROLES)),
      newspaper: optional(z.string()),
      proofDocumentId: optional(uuid),
    }),
    ({ db, actor, signal }, v) =>
      recordServiceEvent(
        db,
        actor,
        {
          orderId: v.orderId,
          recipientId: v.recipientId ?? null,
          method: v.method,
          servedOn: v.servedOn,
          ...(v.serverName === undefined ? {} : { serverName: v.serverName }),
          ...(v.serverRole === undefined ? {} : { serverRole: v.serverRole }),
          ...(v.newspaper === undefined ? {} : { newspaper: v.newspaper }),
          proofDocumentId: v.proofDocumentId ?? null,
        },
        signal,
      ),
    'Service recorded.',
  )
}

export async function answerAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ recipientId: uuid, answeredOn: date, documentId: uuid }),
    ({ db, actor, signal }, v) => recordAnswer(db, actor, v, signal),
    'Answer recorded.',
  )
}

export async function courtStepAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      orderId: uuid,
      kind: z.enum(COURT_STEP_KINDS),
      occurredOn: date,
      court: z.string().min(1),
      docket: optional(z.string()),
      documentId: uuid,
      judgmentOutcome: optional(z.enum(JUDGMENT_OUTCOMES)),
    }),
    ({ db, actor, signal }, v) =>
      recordCourtStep(
        db,
        actor,
        {
          orderId: v.orderId,
          kind: v.kind,
          occurredOn: v.occurredOn,
          court: v.court,
          documentId: v.documentId,
          ...(v.docket === undefined ? {} : { docket: v.docket }),
          ...(v.judgmentOutcome === undefined ? {} : { judgmentOutcome: v.judgmentOutcome }),
        },
        signal,
      ),
    'Court step recorded.',
  )
}
