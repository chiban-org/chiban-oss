import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { type enforcementOrders, orderCourtSteps } from '@/db/schema'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { answerDueOf } from '@/features/enforcement/answers'
import { type MotionBlock, motionBlocks } from '@/features/enforcement/motionGate'
import {
  loadServiceState,
  orderRule,
  type ServiceState,
  statusOf,
} from '@/features/enforcement/service'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import type { StayState } from '@/features/enforcement/stay'
import type { CeaseAndDesistRule } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export interface OrderDetail {
  row: typeof enforcementOrders.$inferSelect
  rule: CeaseAndDesistRule
  service: ServiceState
  status: ServiceStatus
  steps: (typeof orderCourtSteps.$inferSelect)[]
  gate: { open: true } | { open: false; blocks: MotionBlock[] }
  answerDues: { recipientId: string; name: string; due: SubjectDue; answeredOn: string | null }[]
  appealDue: SubjectDue | null
}

export function buildOrderDetail(
  row: typeof enforcementOrders.$inferSelect,
  service: ServiceState,
  steps: (typeof orderCourtSteps.$inferSelect)[],
  stay: StayState,
  today: CivilDate,
): OrderDetail {
  const rule = orderRule(row)
  const status = statusOf(rule, service)
  const filed = steps
    .filter((s) => s.kind === 'filed_with_clerk')
    .map((s) => s.occurredOn)
    .sort()[0]
  const gate = motionBlocks({
    rule,
    status,
    recipients: service.recipients.map((r) => ({
      answerDue: answerDueOf(r.row),
      answeredOn: r.row.answeredOn as CivilDate | null,
      served: status.servedOn[r.id] !== undefined,
    })),
    filedWithClerkOn: (filed ?? null) as CivilDate | null,
    stay,
    today,
  })
  const judgment = steps.find((s) => s.kind === 'judgment')
  return {
    row,
    rule,
    service,
    status,
    steps,
    gate: gate.length === 0 ? { open: true } : { open: false, blocks: gate },
    answerDues: service.recipients.flatMap((r) => {
      const due = answerDueOf(r.row)
      return due === null
        ? []
        : [{ recipientId: r.id, name: r.name, due, answeredOn: r.row.answeredOn }]
    }),
    appealDue:
      judgment?.appealDue === undefined || judgment.appealDue === null
        ? null
        : (judgment.appealDue as SubjectDue),
  }
}

export async function loadOrderDetail(
  db: DbOrTx,
  row: typeof enforcementOrders.$inferSelect,
  stay: StayState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<OrderDetail> {
  const service = await loadServiceState(db, row.id, signal)
  const steps = await db.select().from(orderCourtSteps).where(eq(orderCourtSteps.orderId, row.id))
  return buildOrderDetail(row, service, steps, stay, today)
}
