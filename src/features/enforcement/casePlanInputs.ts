import { asc, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  type EnforcementStatus,
  enforcementFines,
  enforcementOrders,
  orderCourtSteps,
  orderServiceEvents,
  orderServiceRecipients,
  orderServiceRoleChecks,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { buildOrderDetail } from '@/features/enforcement/caseDetail'
import { serviceStateOf } from '@/features/enforcement/service'
import { staysFor } from '@/features/enforcement/stay'
import type { CasePlanInput } from '@/features/enforcement/workPlan'
import { fineDueByIds } from '@/features/ledger/fineDue'
import type { CivilDate } from '@/types/civilDate'

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const list = groups.get(key(item))
    if (list === undefined) groups.set(key(item), [item])
    else list.push(item)
  }
  return groups
}

export async function loadCasePlanInputs(
  db: DbOrTx,
  cases: readonly { caseId: string; status: EnforcementStatus }[],
  today: CivilDate,
  signal: AbortSignal,
): Promise<Map<string, CasePlanInput>> {
  signal.throwIfAborted()
  const inputs = new Map<string, CasePlanInput>()
  if (cases.length === 0) return inputs
  const caseIds = cases.map((c) => c.caseId)
  const [stays, findings, notices, orders, fines, referrals] = await Promise.all([
    staysFor(db, caseIds, today, signal),
    db
      .select()
      .from(violationFindings)
      .where(inArray(violationFindings.caseId, caseIds))
      .orderBy(asc(violationFindings.foundOn)),
    db
      .select()
      .from(violationNotices)
      .where(inArray(violationNotices.caseId, caseIds))
      .orderBy(asc(violationNotices.sentOn)),
    db
      .select()
      .from(enforcementOrders)
      .where(inArray(enforcementOrders.caseId, caseIds))
      .orderBy(asc(enforcementOrders.number)),
    db.select().from(enforcementFines).where(inArray(enforcementFines.caseId, caseIds)),
    db
      .select()
      .from(counselReferrals)
      .where(inArray(counselReferrals.caseId, caseIds))
      .orderBy(asc(counselReferrals.referredOn)),
  ])
  const orderIds = orders.map((o) => o.id)
  const referralIds = referrals.map((r) => r.id)
  const [steps, checks, recipients, events, outcomes, dues] = await Promise.all([
    orderIds.length === 0
      ? []
      : db.select().from(orderCourtSteps).where(inArray(orderCourtSteps.orderId, orderIds)),
    orderIds.length === 0
      ? []
      : db
          .select()
          .from(orderServiceRoleChecks)
          .where(inArray(orderServiceRoleChecks.orderId, orderIds)),
    orderIds.length === 0
      ? []
      : db
          .select()
          .from(orderServiceRecipients)
          .where(inArray(orderServiceRecipients.orderId, orderIds)),
    orderIds.length === 0
      ? []
      : db.select().from(orderServiceEvents).where(inArray(orderServiceEvents.orderId, orderIds)),
    referralIds.length === 0
      ? []
      : db
          .select()
          .from(counselOutcomes)
          .where(inArray(counselOutcomes.referralId, referralIds))
          .orderBy(asc(counselOutcomes.occurredOn)),
    fineDueByIds(
      db,
      fines.map((f) => f.id),
    ),
  ])
  const findingsBy = groupBy(findings, (f) => f.caseId)
  const noticesBy = groupBy(notices, (n) => n.caseId)
  const ordersBy = groupBy(orders, (o) => o.caseId)
  const finesBy = groupBy(fines, (f) => f.caseId)
  const referralsBy = groupBy(referrals, (r) => r.caseId)
  const stepsBy = groupBy(steps, (s) => s.orderId)
  const checksBy = groupBy(checks, (c) => c.orderId)
  const recipientsBy = groupBy(recipients, (r) => r.orderId)
  const eventsBy = groupBy(events, (e) => e.orderId)
  const outcomesBy = groupBy(outcomes, (o) => o.referralId)
  for (const { caseId, status } of cases) {
    const stay = stays.get(caseId) ?? { stayed: false, reason: null, appealId: null }
    inputs.set(caseId, {
      staff: { row: { status } },
      today,
      stay,
      banner: null,
      findings: findingsBy.get(caseId) ?? [],
      notices: noticesBy.get(caseId) ?? [],
      orders: (ordersBy.get(caseId) ?? []).map((row) =>
        buildOrderDetail(
          row,
          serviceStateOf(
            checksBy.get(row.id) ?? [],
            recipientsBy.get(row.id) ?? [],
            eventsBy.get(row.id) ?? [],
          ),
          stepsBy.get(row.id) ?? [],
          stay,
          today,
        ),
      ),
      fines: (finesBy.get(caseId) ?? []).map((row) => ({ row, dueCents: dues.get(row.id) ?? 0 })),
      referrals: (referralsBy.get(caseId) ?? []).map((row) => ({
        outcomes: outcomesBy.get(row.id) ?? [],
      })),
    })
  }
  return inputs
}
