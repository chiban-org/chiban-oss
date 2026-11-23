import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  classificationOfApplication,
  mayActOnClassification,
  plumbingInspectorOwns,
} from '@/features/authz/classificationScope'

export async function mayActAsPlumbingOwner(
  db: DbOrTx,
  actor: Actor,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  return (
    plumbingInspectorOwns(classification) &&
    (await mayActOnClassification(db, actor, 'permit.issue', classification, signal))
  )
}

export async function mayActAsPlumbingOwnerOf(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const classification = await classificationOfApplication(db, applicationId, signal)
  return await mayActAsPlumbingOwner(db, actor, classification, signal)
}

export async function mayManageApplication(
  db: DbOrTx,
  actor: Actor,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  return (
    (await hasCapability(db, actor.userId, 'application.manage', signal)) ||
    (await mayActAsPlumbingOwner(db, actor, classification, signal))
  )
}
