import type { Db } from '@/db/client'
import { mayActAsPlumbingOwner } from '@/features/applications/plumbingOwner'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  mayActOnClassification,
  mayRecordAppealOn,
  packHasPlumbingScope,
} from '@/features/authz/classificationScope'

export interface StaffViewPermissions {
  canIssue: boolean
  canRecordAppeal: boolean
  canAdjustClock: boolean
  canOverrideGate: boolean
  canRecordStatutoryException: boolean
  canOverrideFee: boolean
  canDetermineRegionalImpact: boolean
  canManageWorkflow: boolean
  canOpenHearings: boolean
}

export async function permissionsOf(
  db: Db,
  actor: Actor,
  classification: string | undefined,
  signal: AbortSignal,
): Promise<StaffViewPermissions> {
  const has = (c: Parameters<typeof hasCapability>[2]) => hasCapability(db, actor.userId, c, signal)
  const canIssue = await mayActOnClassification(db, actor, 'permit.issue', classification, signal)
  return {
    canIssue,
    canRecordAppeal: packHasPlumbingScope()
      ? await mayRecordAppealOn(db, actor, classification, signal)
      : canIssue,
    canAdjustClock: await has('clock.adjust'),
    canOverrideGate:
      (await has('gate.override_admin')) ||
      (await mayActAsPlumbingOwner(db, actor, classification, signal)),
    canRecordStatutoryException: await has('gate.record_statutory_exception'),
    canOverrideFee: await has('fee.override'),
    canDetermineRegionalImpact: await has('regional_impact.determine'),
    canManageWorkflow: await has('application.manage'),
    canOpenHearings: await has('board.record'),
  }
}
