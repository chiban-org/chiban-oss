import { and, eq, ne, sql } from 'drizzle-orm'
import type { Capability } from '@/constants/capabilities'
import { type Role, STAFF_ROLES } from '@/constants/roles'
import type { DbOrTx } from '@/db/client'
import { inspections, roleCapabilities, userRoles, users } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { packRoles } from '@/features/packs/roles'

const PLUMBING_INSPECTOR = 'plumbing_inspector'

export function plumbingInspectorOwns(classification: string | undefined): boolean {
  return (
    classification !== undefined &&
    packRoles().classifications.plumbingInspectorOwns.includes(classification)
  )
}

export function packHasPlumbingScope(): boolean {
  return packRoles().classifications.plumbingInspectorOwns.length > 0
}

export function packStaffRoles(): readonly Role[] {
  return STAFF_ROLES.filter((role) => role !== PLUMBING_INSPECTOR || packHasPlumbingScope())
}

export async function userMayActOnClassification(
  db: DbOrTx,
  userId: string,
  capability: Capability,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  if (!packHasPlumbingScope()) return await hasCapability(db, userId, capability, signal)
  signal.throwIfAborted()
  const scope = plumbingInspectorOwns(classification)
    ? eq(userRoles.role, PLUMBING_INSPECTOR)
    : ne(userRoles.role, PLUMBING_INSPECTOR)
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roleCapabilities,
      and(eq(roleCapabilities.role, userRoles.role), eq(roleCapabilities.capability, capability)),
    )
    .where(and(eq(users.id, userId), eq(users.isActive, true), scope))
    .limit(1)
  return rows.length > 0
}

export async function mayActOnClassification(
  db: DbOrTx,
  actor: Actor,
  capability: Capability,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  if (plumbingInspectorOwns(classification) && !actor.roles.includes(PLUMBING_INSPECTOR)) {
    return false
  }
  return await userMayActOnClassification(db, actor.userId, capability, classification, signal)
}

export async function mayRecordAppealOn(
  db: DbOrTx,
  actor: Actor,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  if (!packHasPlumbingScope()) return await hasCapability(db, actor.userId, 'permit.issue', signal)
  const plumbing =
    plumbingInspectorOwns(classification) &&
    actor.roles.includes(PLUMBING_INSPECTOR) &&
    (await userMayActOnClassification(db, actor.userId, 'permit.issue', classification, signal))
  if (plumbing) return true
  return await userMayActOnClassification(db, actor.userId, 'permit.issue', undefined, signal)
}

export async function classificationOfApplication(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!packHasPlumbingScope()) return undefined
  const context = await loadApplicationContext(db, applicationId, signal)
  return context?.typeBody.classification
}

export async function classificationOfInspection(
  db: DbOrTx,
  inspectionId: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!packHasPlumbingScope()) return undefined
  const [row] = await db
    .select({ applicationId: inspections.applicationId })
    .from(inspections)
    .where(eq(inspections.id, inspectionId))
  return row === undefined
    ? undefined
    : await classificationOfApplication(db, row.applicationId, signal)
}

export async function mayActOnApplication(
  db: DbOrTx,
  actor: Actor,
  capability: Capability,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const classification = await classificationOfApplication(db, applicationId, signal)
  return await mayActOnClassification(db, actor, capability, classification, signal)
}

export async function mayActOnInspection(
  db: DbOrTx,
  actor: Actor,
  capability: Capability,
  inspectionId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const classification = await classificationOfInspection(db, inspectionId, signal)
  return await mayActOnClassification(db, actor, capability, classification, signal)
}

export async function userMayActOnInspection(
  db: DbOrTx,
  userId: string,
  capability: Capability,
  inspectionId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const classification = await classificationOfInspection(db, inspectionId, signal)
  return await userMayActOnClassification(db, userId, capability, classification, signal)
}
