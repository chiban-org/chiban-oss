import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  classificationOfApplication,
  mayActOnClassification,
  packHasPlumbingScope,
} from '@/features/authz/classificationScope'

export async function mayUseCounter(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<boolean> {
  return (
    (await hasCapability(db, actor.userId, 'permit.issue', signal)) &&
    (await hasCapability(db, actor.userId, 'payment.collect', signal))
  )
}

export async function mayUseCounterFor(
  db: DbOrTx,
  actor: Actor,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  if (!packHasPlumbingScope()) return true
  return (
    (await mayActOnClassification(db, actor, 'permit.issue', classification, signal)) &&
    (await mayActOnClassification(db, actor, 'payment.collect', classification, signal))
  )
}

export async function mayUseCounterForApplication(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (!packHasPlumbingScope()) return true
  const classification = await classificationOfApplication(db, applicationId, signal)
  return await mayUseCounterFor(db, actor, classification, signal)
}
