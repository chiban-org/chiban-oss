import { type CeaseAndDesistRule, civilDateSchema } from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import { documents, orderServiceEvents, SERVER_ROLES, SERVICE_METHODS } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import {
  issuedOrderForUpdate,
  loadServiceState,
  orderRule,
  type ServiceState,
  settleService,
} from '@/features/enforcement/service'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

const ServiceEventSchema = z.object({
  orderId: z.string().uuid(),
  recipientId: z.string().uuid().nullable(),
  method: z.enum(SERVICE_METHODS),
  servedOn: civilDateSchema,
  serverName: z.string().trim().min(1).max(200).optional(),
  serverRole: z.enum(SERVER_ROLES).optional(),
  newspaper: z.string().trim().min(1).max(200).optional(),
  proofDocumentId: z.string().uuid().nullable(),
})

export type ServiceEventError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'order_not_issued'
  | 'recipient_not_found'
  | 'proof_required'
  | 'fallback_needs_owner_not_found'
  | 'server_role_required'
  | 'date_in_future'
  | 'recipient_method_mismatch'

const FALLBACK_METHODS: readonly string[] = ['posting_on_property', 'newspaper_publication']
const PERSONAL_METHODS = ['in_hand', 'abode']

function serviceInputError(
  rule: CeaseAndDesistRule,
  before: ServiceState,
  value: z.output<typeof ServiceEventSchema>,
): ServiceEventError | null {
  if (value.recipientId !== null && !before.recipients.some((r) => r.id === value.recipientId)) {
    return 'recipient_not_found'
  }
  const personal = PERSONAL_METHODS.includes(value.method)
  if (personal && (value.serverName === undefined || !serverRoleAllowed(rule, value.serverRole))) {
    return 'server_role_required'
  }
  if (!FALLBACK_METHODS.includes(value.method)) return null
  const ownerNotFound = before.checks.some(
    (c) => c.role === 'record_owner' && c.outcome === 'owner_not_found',
  )
  const postingRefused =
    value.method === 'posting_on_property' && !rule.ownerNotFoundFallback.posting
  return ownerNotFound && !postingRefused ? null : 'fallback_needs_owner_not_found'
}

export async function recordServiceEvent(
  db: Db,
  actor: Actor,
  input: z.input<typeof ServiceEventSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ eventId: string; status: ServiceStatus }, ServiceEventError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ServiceEventSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  const isFallback = FALLBACK_METHODS.includes(value.method)
  if (isFallback !== (value.recipientId === null)) return err('recipient_method_mismatch')
  return await transactionResult<{ eventId: string; status: ServiceStatus }, ServiceEventError>(
    db,
    async (tx) => {
      const order = await issuedOrderForUpdate(tx, value.orderId)
      if (order === undefined) return err('not_found')
      if (order.status === 'draft') return err('order_not_issued')
      if (value.servedOn > (await townToday(tx, now, signal))) return err('date_in_future')
      const rule = orderRule(order)
      const before = await loadServiceState(tx, value.orderId, signal)
      const invalid = serviceInputError(rule, before, value)
      if (invalid !== null) return err(invalid)
      const proof = await validProof(tx, order.caseId, value.proofDocumentId)
      if (!proof) return err('proof_required')
      const [row] = await tx
        .insert(orderServiceEvents)
        .values({
          orderId: value.orderId,
          recipientId: value.recipientId,
          method: value.method,
          servedOn: value.servedOn,
          serverName: value.serverName ?? null,
          serverRole: value.serverRole ?? null,
          newspaper: value.newspaper ?? null,
          proofDocumentId: value.proofDocumentId ?? '',
          recordedBy: actor.userId,
        })
        .returning({ id: orderServiceEvents.id })
      const status = await settleService(tx, order, signal)
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'enforcement.service_recorded',
          entityType: 'enforcement_order',
          entityId: value.orderId,
          after: { eventId: row?.id, method: value.method, servedOn: value.servedOn },
        },
        signal,
      )
      return ok({ eventId: row?.id ?? '', status })
    },
  )
}

export function serverRoleAllowed(
  rule: CeaseAndDesistRule,
  role: (typeof SERVER_ROLES)[number] | undefined,
): boolean {
  return role !== undefined && (rule.personalServerRoles as readonly string[]).includes(role)
}

export async function validProof(
  tx: DbOrTx,
  caseId: string,
  documentId: string | null,
): Promise<boolean> {
  if (documentId === null) return false
  const [doc] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.recordKind, 'enforcement_case'),
        eq(documents.recordId, caseId),
        eq(documents.docKind, 'service_proof'),
      ),
    )
  return doc !== undefined
}
