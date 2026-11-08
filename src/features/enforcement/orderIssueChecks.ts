import type { CeaseAndDesistRule, OrderContentField } from '@packs/nh/schema'
import type { enforcementOrders, violationFindings } from '@/db/schema'
import { missingOrderContent } from '@/features/enforcement/orderPdf'

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
