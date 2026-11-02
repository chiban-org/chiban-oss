import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { applications, feeOverrides } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { TERMINAL_STATES } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { getVersion } from '@/features/config/store'
import type { FeeScheduleBody } from '@/features/fees/feeSchema'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { err, ok, type Result } from '@/types/result'

export type FeeOverrideRow = typeof feeOverrides.$inferSelect & {
  applicationNumber: string
  status: OverrideStatus
}

export interface FeeOverrideInput {
  applicationId: string
  feeCode: string
  kind: 'waive' | 'set_amount'
  amountCents?: number
  reason: string
}

export async function createFeeOverride(
  db: DbOrTx,
  actor: Actor,
  input: FeeOverrideInput,
  signal: AbortSignal,
): Promise<
  Result<{ overrideId: string }, 'forbidden' | 'reason_required' | 'amount_required' | 'not_found'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'fee.override', signal)
  if (!allowed.ok) return err('forbidden')
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  if (input.kind === 'set_amount' && input.amountCents === undefined) return err('amount_required')
  return await transactionResult(db, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    if (app === undefined) return err('not_found')
    const previous = await tx
      .select({ id: feeOverrides.id })
      .from(feeOverrides)
      .where(
        and(
          eq(feeOverrides.applicationId, input.applicationId),
          eq(feeOverrides.feeCode, input.feeCode),
          isNull(feeOverrides.supersededBy),
        ),
      )
    const [created] = await tx
      .insert(feeOverrides)
      .values({
        applicationId: input.applicationId,
        feeCode: input.feeCode,
        kind: input.kind,
        amountCents: input.kind === 'set_amount' ? (input.amountCents ?? null) : null,
        reason,
        createdBy: actor.userId,
      })
      .returning({ id: feeOverrides.id })
    const overrideId = created?.id ?? ''
    if (previous.length > 0) {
      await tx
        .update(feeOverrides)
        .set({ supersededBy: overrideId })
        .where(
          inArray(
            feeOverrides.id,
            previous.map((p) => p.id),
          ),
        )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'fee_override.create',
        entityType: 'application',
        entityId: input.applicationId,
        after: { overrideId, feeCode: input.feeCode, kind: input.kind, reason },
      },
      signal,
    )
    return ok({ overrideId })
  })
}

function statusOf(
  row: typeof feeOverrides.$inferSelect,
  state: string,
  scheduleCodes: Set<string>,
): OverrideStatus {
  if (row.supersededBy !== null) return 'superseded'
  if ((TERMINAL_STATES as readonly string[]).includes(state)) return 'expired'
  if (!scheduleCodes.has(row.feeCode)) return 'no_match'
  return 'applied'
}

export async function listFeeOverrides(db: DbOrTx, signal: AbortSignal): Promise<FeeOverrideRow[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({
      o: feeOverrides,
      state: applications.state,
      pins: applications.configPins,
      number: applications.number,
    })
    .from(feeOverrides)
    .innerJoin(applications, eq(applications.id, feeOverrides.applicationId))
    .orderBy(desc(feeOverrides.createdAt))
  const codesByVersion = new Map<string, Set<string>>()
  const out: FeeOverrideRow[] = []
  for (const { o, state, pins, number } of rows) {
    const versionId = (pins as { feeSchedule: string }).feeSchedule
    let codes = codesByVersion.get(versionId)
    if (codes === undefined) {
      const version = await getVersion(db, versionId, signal)
      codes = new Set(
        (version?.body as FeeScheduleBody | undefined)?.lines.map((l) => l.code) ?? [],
      )
      codesByVersion.set(versionId, codes)
    }
    out.push({ ...o, applicationNumber: number, status: statusOf(o, state, codes) })
  }
  return out
}
