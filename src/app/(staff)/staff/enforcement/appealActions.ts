'use server'

import { z } from 'zod'
import { ENFORCEMENT_APPEAL_OUTCOMES, PERIL_CATEGORIES } from '@/db/schema'
import {
  certifyImminentPeril,
  dissolveRestrainingOrder,
  recordEnforcementAppeal,
  recordRestrainingOrder,
  resolveEnforcementAppeal,
} from '@/features/enforcement/appeals'
import type { ActionResult } from '@/server/actionRunner'
import { runEnforcement } from './enforcementAction'
import { date, uuid } from './fields'

export async function appealAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      caseId: uuid,
      target: z.string().regex(/^(order|notice):[0-9a-f-]{36}$/),
      filedOn: date,
      appellantName: z.string().min(1),
    }),
    ({ db, actor, signal }, v) => {
      const [targetKind, targetId] = v.target.split(':')
      return recordEnforcementAppeal(
        db,
        actor,
        {
          caseId: v.caseId,
          targetKind: targetKind === 'notice' ? 'notice' : 'order',
          targetId: targetId ?? '',
          filedOn: v.filedOn,
          appellantName: v.appellantName,
        },
        signal,
        new Date(),
      )
    },
    'Appeal recorded.',
  )
}

export async function resolveAppealAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ appealId: uuid, resolvedOn: date, outcome: z.enum(ENFORCEMENT_APPEAL_OUTCOMES) }),
    ({ db, actor, signal }, v) => resolveEnforcementAppeal(db, actor, v, signal, new Date()),
    'Appeal resolved.',
  )
}

export async function certifyPerilAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      appealId: uuid,
      category: z.enum(PERIL_CATEGORIES),
      statement: z.string().min(1),
      certifiedOn: date,
    }),
    ({ db, actor, signal }, v) =>
      certifyImminentPeril(
        db,
        actor,
        {
          appealId: v.appealId,
          categories: [v.category],
          statement: v.statement,
          certifiedOn: v.certifiedOn,
        },
        signal,
      ),
    'Imminent peril certified.',
  )
}

export async function restrainingOrderAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({
      appealId: uuid,
      issuedBy: z.enum(['zba', 'superior_court']),
      issuedOn: date,
      documentId: uuid,
    }),
    ({ db, actor, signal }, v) => recordRestrainingOrder(db, actor, v, signal),
    'Restraining order recorded.',
  )
}

export async function dissolveRestrainingOrderAction(formData: FormData): Promise<ActionResult> {
  return await runEnforcement(
    formData,
    z.object({ restrainingOrderId: uuid, dissolvedOn: date }),
    ({ db, actor, signal }, v) => dissolveRestrainingOrder(db, actor, v, signal),
    'Restraining order marked dissolved.',
  )
}
