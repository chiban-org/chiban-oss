import {
  type CeaseAndDesistRule,
  civilDateSchema,
  type RecipientRole,
  RecipientRoleSchema,
} from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, DbOrTx, Tx } from '@/db/client'
import {
  documents,
  enforcementOrders,
  orderServiceEvents,
  orderServiceRecipients,
  orderServiceRoleChecks,
  SERVER_ROLES,
  SERVICE_METHODS,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { refreshAnswerDues } from '@/features/enforcement/answers'
import {
  type ServiceCheck,
  type ServiceEvent,
  type ServiceRecipient,
  type ServiceStatus,
  serviceStatus,
} from '@/features/enforcement/serviceStatus'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export function orderRule(order: { ruleKey: string; ruleVersion: number }): CeaseAndDesistRule {
  const rule = ruleByKey(loadPack(), order.ruleKey, order.ruleVersion)
  if (rule.kind !== 'cease_and_desist') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Order rule is not a cease and desist rule', {
      key: order.ruleKey,
    })
  }
  return rule
}

export interface ServiceState {
  checks: ServiceCheck[]
  recipients: (ServiceRecipient & {
    name: string
    address: string
    source: string
    row: typeof orderServiceRecipients.$inferSelect
  })[]
  events: (ServiceEvent & { row: typeof orderServiceEvents.$inferSelect })[]
}

export function serviceStateOf(
  checks: (typeof orderServiceRoleChecks.$inferSelect)[],
  recipients: (typeof orderServiceRecipients.$inferSelect)[],
  events: (typeof orderServiceEvents.$inferSelect)[],
): ServiceState {
  return {
    checks: checks.map((c) => ({ role: c.role, outcome: c.outcome })),
    recipients: recipients.map((r) => ({
      id: r.id,
      role: r.role,
      name: r.name,
      address: r.address,
      source: r.source,
      row: r,
    })),
    events: events.map((e) => ({
      id: e.id,
      recipientId: e.recipientId,
      method: e.method,
      servedOn: e.servedOn as CivilDate,
      row: e,
    })),
  }
}

export async function loadServiceState(
  db: DbOrTx,
  orderId: string,
  signal: AbortSignal,
): Promise<ServiceState> {
  signal.throwIfAborted()
  const [checks, recipients, events] = await Promise.all([
    db.select().from(orderServiceRoleChecks).where(eq(orderServiceRoleChecks.orderId, orderId)),
    db.select().from(orderServiceRecipients).where(eq(orderServiceRecipients.orderId, orderId)),
    db.select().from(orderServiceEvents).where(eq(orderServiceEvents.orderId, orderId)),
  ])
  return serviceStateOf(checks, recipients, events)
}

export function statusOf(rule: CeaseAndDesistRule, state: ServiceState): ServiceStatus {
  return serviceStatus(rule, state)
}

export async function settleService(
  tx: Tx,
  order: typeof enforcementOrders.$inferSelect,
  signal: AbortSignal,
): Promise<ServiceStatus> {
  const status = statusOf(orderRule(order), await loadServiceState(tx, order.id, signal))
  if (status.complete && order.status === 'issued') {
    await tx
      .update(enforcementOrders)
      .set({ status: 'served', rowVersion: order.rowVersion + 1 })
      .where(eq(enforcementOrders.id, order.id))
  }
  await refreshAnswerDues(tx, order.id, signal)
  return status
}

export async function issuedOrderForUpdate(tx: Tx, orderId: string) {
  const [order] = await tx
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.id, orderId))
    .for('update')
  return order
}

const RecipientSchema = z.object({
  orderId: z.string().uuid(),
  role: RecipientRoleSchema,
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1).max(300),
})

export async function listRecipient(
  db: Db,
  actor: Actor,
  input: z.input<typeof RecipientSchema>,
  signal: AbortSignal,
): Promise<
  Result<{ recipientId: string }, 'forbidden' | 'invalid' | 'not_found' | 'order_not_issued'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = RecipientSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const order = await issuedOrderForUpdate(tx, value.orderId)
    if (order === undefined) return err('not_found')
    if (order.status === 'draft') return err('order_not_issued')
    const [row] = await tx
      .insert(orderServiceRecipients)
      .values({
        orderId: value.orderId,
        role: value.role,
        name: value.name,
        address: value.address,
        source: value.source,
      })
      .returning({ id: orderServiceRecipients.id })
    await settleService(tx, order, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.recipient_listed',
        entityType: 'enforcement_order',
        entityId: value.orderId,
        after: { recipientId: row?.id, role: value.role },
      },
      signal,
    )
    return ok({ recipientId: row?.id ?? '' })
  })
}

const ALLOWED_OUTCOMES: Record<RecipientRole, readonly ServiceCheck['outcome'][]> = {
  record_owner: ['recipients_listed', 'owner_not_found'],
  owner_agent: ['recipients_listed', 'none_exist'],
  taxpayer: ['recipients_listed', 'none_exist', 'same_as_owner'],
  occupying_tenant: ['recipients_listed', 'none_exist'],
  person_in_control: ['recipients_listed', 'none_exist'],
  mortgagee_of_record: ['recipients_listed', 'none_exist'],
}

const RoleCheckSchema = z.object({
  orderId: z.string().uuid(),
  role: RecipientRoleSchema,
  outcome: z.enum(['recipients_listed', 'none_exist', 'same_as_owner', 'owner_not_found']),
  basis: z.string().trim().min(1).max(500),
  checkedOn: civilDateSchema,
})

export async function recordRoleCheck(
  db: Db,
  actor: Actor,
  input: z.input<typeof RoleCheckSchema>,
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'invalid' | 'not_found' | 'order_not_issued' | 'invalid_outcome'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = RoleCheckSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const order = await issuedOrderForUpdate(tx, value.orderId)
    if (order === undefined) return err('not_found')
    if (order.status === 'draft') return err('order_not_issued')
    const rule = orderRule(order)
    const permitted =
      rule.recipientRoles.includes(value.role) &&
      ALLOWED_OUTCOMES[value.role].includes(value.outcome)
    if (!permitted) return err('invalid_outcome')
    const values = {
      orderId: value.orderId,
      role: value.role,
      outcome: value.outcome,
      basis: value.basis,
      checkedBy: actor.userId,
      checkedOn: value.checkedOn,
    }
    await tx
      .insert(orderServiceRoleChecks)
      .values(values)
      .onConflictDoUpdate({
        target: [orderServiceRoleChecks.orderId, orderServiceRoleChecks.role],
        set: values,
      })
    await settleService(tx, order, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.role_checked',
        entityType: 'enforcement_order',
        entityId: value.orderId,
        after: { role: value.role, outcome: value.outcome },
      },
      signal,
    )
    return ok(undefined)
  })
}
