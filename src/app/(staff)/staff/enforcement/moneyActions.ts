'use server'

import { z } from 'zod'
import { COUNSEL_OUTCOME_KINDS, COUNSEL_PURPOSES, FINE_KINDS } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { recordCounselOutcome, referToCounsel } from '@/features/enforcement/counsel'
import { recordFine } from '@/features/enforcement/fines'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runEnforcement } from './enforcementAction'
import { date, optional, uuid } from './fields'

export async function fineAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      basis: z.string().regex(/^([0-9a-f-]{36}:[0-9a-f-]{36}|counsel:[0-9a-f-]{36})$/),
      kind: z.enum(FINE_KINDS),
      dollars: z.coerce.number().positive(),
      imposedOn: date,
      court: z.string().min(1),
      docket: z.string().min(1),
    }),
    ({ db, actor, signal }, v) => {
      const [head, tail] = v.basis.split(':')
      const base = {
        caseId: v.caseId,
        kind: v.kind,
        amountCents: Math.round(v.dollars * 100),
        imposedOn: v.imposedOn,
        court: v.court,
        docket: v.docket,
      }
      return recordFine(
        db,
        actor,
        head === 'counsel'
          ? { ...base, counselOutcomeId: tail ?? '' }
          : { ...base, orderId: head ?? '', judgmentStepId: tail ?? '' },
        signal,
      )
    },
    'Fine recorded.',
  )
}

export async function referAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      counselName: z.string().min(1),
      purpose: z.enum(COUNSEL_PURPOSES),
      referredOn: date,
    }),
    ({ db, actor, signal }, v) => referToCounsel(db, getObjectStore(), actor, v, signal),
    'Referred to counsel. The packet is on the case.',
  )
}

export async function outcomeAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      referralId: uuid,
      kind: z.enum(COUNSEL_OUTCOME_KINDS),
      occurredOn: date,
      court: optional(z.string()),
      docket: optional(z.string()),
      documentId: optional(uuid),
      note: optional(z.string()),
    }),
    ({ db, actor, signal }, v) =>
      recordCounselOutcome(
        db,
        actor,
        {
          referralId: v.referralId,
          kind: v.kind,
          occurredOn: v.occurredOn,
          ...(v.court === undefined ? {} : { court: v.court }),
          ...(v.docket === undefined ? {} : { docket: v.docket }),
          ...(v.documentId === undefined ? {} : { documentId: v.documentId }),
          ...(v.note === undefined ? {} : { note: v.note }),
        },
        signal,
      ),
    'Outcome recorded.',
  )
}

export async function finePaymentAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      fineId: uuid,
      dollars: z.coerce.number().positive(),
      method: z.enum(['cash', 'check']),
      checkNumber: optional(z.string()),
      payerName: z.string().min(1),
    }),
    ({ db, actor, signal }, v) => {
      const amountCents = Math.round(v.dollars * 100)
      return recordCounterPayment(
        db,
        actor,
        {
          method: v.method,
          amountCents,
          payerName: v.payerName,
          ...(v.checkNumber === undefined ? {} : { checkNumber: v.checkNumber }),
          allocations: [{ targetKind: 'fine', fineId: v.fineId, amountCents }],
        },
        signal,
      )
    },
    'Payment recorded.',
  )
}
