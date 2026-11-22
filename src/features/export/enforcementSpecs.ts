import * as t from '@/db/schema'
import type { Spec } from '@/features/export/entities'

export const ENFORCEMENT_SPECS: Spec[] = [
  { table: t.enforcementCases },
  { table: t.complaints },
  { table: t.enforcementNotes },
  { table: t.violationFindings },
  { table: t.violationNotices },
  { table: t.cureNotices },
  { table: t.enforcementDesignations },
  { table: t.enforcementOrders },
  { table: t.orderServiceRecipients },
  { table: t.orderServiceRoleChecks },
  { table: t.orderServiceEvents },
  { table: t.orderCourtSteps },
  { table: t.enforcementAppeals },
  { table: t.perilCertifications },
  { table: t.restrainingOrders },
  { table: t.counselReferrals },
  { table: t.counselOutcomes },
  { table: t.enforcementFines },
  { table: t.developmentHolds },
  { table: t.holdPermitActions },
  { table: t.enforcementCivilActions },
  { table: t.anonymousIntakeVerifications },
]
