import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  cureNotices,
  type enforcementOrders,
  type violationFindings,
  violationNotices,
} from '@/db/schema'
import { packHasCureRules } from '@/features/enforcement/cureRules'
import { noticeOfViolationSent } from '@/features/enforcement/noticeRequirement'
import { missingOrderContent } from '@/features/enforcement/orderPdf'
import type { CeaseAndDesistRule, OrderContentField } from '@/features/packs/schema'

export function contentProblem(
  rule: CeaseAndDesistRule,
  order: typeof enforcementOrders.$inferSelect,
  findings: (typeof violationFindings.$inferSelect)[],
): { findingsNotOpen: string[] } | { missingContent: OrderContentField[] } | null {
  const notOpen = findings.filter((f) => f.status !== 'open').map((f) => f.provisionRef)
  if (notOpen.length > 0) return { findingsNotOpen: notOpen }
  const missing = missingOrderContent(rule, {
    findings,
    correctiveAction: order.correctiveAction,
    correctiveDeadline: order.correctiveDeadline,
  })
  return missing.length > 0 ? { missingContent: missing } : null
}

export async function issueBlock(
  tx: Tx,
  order: typeof enforcementOrders.$inferSelect,
  issuedOn: string,
): Promise<'deadline_before_issue' | 'notice_required' | null> {
  if (order.correctiveDeadline !== null && order.correctiveDeadline < issuedOn) {
    return 'deadline_before_issue'
  }
  const notices = await tx
    .select({ id: violationNotices.id })
    .from(violationNotices)
    .where(eq(violationNotices.caseId, order.caseId))
  if (noticeOfViolationSent(notices)) return null
  return (await cureNoticeSentFor(tx, order.caseId)) ? null : 'notice_required'
}

async function cureNoticeSentFor(tx: Tx, caseId: string): Promise<boolean> {
  if (!packHasCureRules()) return false
  const [sent] = await tx
    .select({ id: cureNotices.id })
    .from(cureNotices)
    .where(eq(cureNotices.caseId, caseId))
    .limit(1)
  return sent !== undefined
}
