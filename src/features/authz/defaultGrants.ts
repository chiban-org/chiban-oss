import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import type { DbOrTx } from '@/db/client'
import { roleCapabilities } from '@/db/schema'

export const DEFAULT_GRANTS: Readonly<Partial<Record<Role, readonly Capability[]>>> = {
  admin: [
    'application.manage',
    'project.manage_parties',
    'gate.record_statutory_exception',
    'payment.refund_void_correct',
    'hold.place_release',
    'config.edit',
    'parcel.manage',
    'gis.import',
    'fee.override',
    'clock.adjust',
    'payment.report',
    'review.assign',
    'document.manage',
    'packet.manage',
    'export.download',
    'export.recovery',
    'export.import',
    'report.view',
    'cutover.import',
    'board.record',
    'board.manage_members',
    'abutters.manage',
    'enforcement.refer_counsel',
    'fine.record',
    'anonymous_intake.enable',
  ],
  staff: [
    'permit.issue',
    'gate.override_admin',
    'document.publish',
    'project.manage_parties',
    'application.amend_after_review',
    'application.manage',
    'parcel.manage',
    'gis.import',
    'fee.override',
    'clock.adjust',
    'regional_impact.determine',
    'payment.collect',
    'payment.report',
    'review.assign',
    'document.manage',
    'packet.manage',
    'inspection.schedule',
    'inspection.record',
    'report.view',
    'cutover.import',
    'board.record',
    'board.manage_members',
    'abutters.manage',
    'enforcement.manage',
    'enforcement.issue_order',
    'enforcement.record_service',
    'enforcement.refer_counsel',
    'rtk.manage',
    'redaction.create',
    'disposition.propose',
  ],
  inspector: [
    'regional_impact.determine',
    'inspection.schedule',
    'inspection.record',
    'enforcement.manage',
    'enforcement.issue_order',
    'enforcement.record_service',
  ],
  finance: [
    'payment.refund_void_correct',
    'payment.collect',
    'payment.report',
    'report.view',
    'fine.record',
  ],
  records_custodian: [
    'hold.place_release',
    'disposition.approve',
    'export.download',
    'document.manage',
    'rtk.manage',
    'redaction.create',
    'disposition.propose',
  ],
}

export async function seedDefaultGrants(db: DbOrTx, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const rows = Object.entries(DEFAULT_GRANTS).flatMap(([role, caps]) =>
    caps.map((capability) => ({ role, capability })),
  )
  await db.insert(roleCapabilities).values(rows).onConflictDoNothing()
}
