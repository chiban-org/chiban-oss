import type { Capability } from '@/constants/capabilities'
import type { Role } from '@/constants/roles'
import type { DbOrTx } from '@/db/client'
import { roleCapabilities } from '@/db/schema'

export const DEFAULT_GRANTS: Readonly<Partial<Record<Role, readonly Capability[]>>> = {
  admin: [
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
  ],
  staff: [
    'permit.issue',
    'gate.override_admin',
    'document.publish',
    'project.manage_parties',
    'application.amend_after_review',
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
  ],
  inspector: ['regional_impact.determine', 'inspection.schedule', 'inspection.record'],
  finance: ['payment.refund_void_correct', 'payment.collect', 'payment.report', 'report.view'],
  records_custodian: [
    'hold.place_release',
    'disposition.approve',
    'export.download',
    'document.manage',
  ],
}

export async function seedDefaultGrants(db: DbOrTx, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const rows = Object.entries(DEFAULT_GRANTS).flatMap(([role, caps]) =>
    caps.map((capability) => ({ role, capability })),
  )
  await db.insert(roleCapabilities).values(rows).onConflictDoNothing()
}
