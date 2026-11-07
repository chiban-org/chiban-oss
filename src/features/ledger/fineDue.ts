import { eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { enforcementFines, ledgerAllocations } from '@/db/schema'
import type { AllocationInput } from '@/features/ledger/types'

export async function fineDueCents(db: DbOrTx, fineId: string): Promise<number> {
  const [fine] = await db
    .select({ amountCents: enforcementFines.amountCents })
    .from(enforcementFines)
    .where(eq(enforcementFines.id, fineId))
  const [paid] = await db
    .select({ cents: sql<number>`coalesce(sum(${ledgerAllocations.amountCents}), 0)::int` })
    .from(ledgerAllocations)
    .where(eq(ledgerAllocations.fineId, fineId))
  return (fine?.amountCents ?? 0) - (paid?.cents ?? 0)
}

export async function fineDueByIds(
  db: DbOrTx,
  fineIds: readonly string[],
): Promise<Map<string, number>> {
  if (fineIds.length === 0) return new Map()
  const [fines, paid] = await Promise.all([
    db
      .select({ id: enforcementFines.id, amountCents: enforcementFines.amountCents })
      .from(enforcementFines)
      .where(inArray(enforcementFines.id, [...fineIds])),
    db
      .select({
        fineId: ledgerAllocations.fineId,
        cents: sql<number>`coalesce(sum(${ledgerAllocations.amountCents}), 0)::int`,
      })
      .from(ledgerAllocations)
      .where(inArray(ledgerAllocations.fineId, [...fineIds]))
      .groupBy(ledgerAllocations.fineId),
  ])
  const paidBy = new Map(paid.map((p) => [p.fineId, p.cents]))
  return new Map(fines.map((f) => [f.id, f.amountCents - (paidBy.get(f.id) ?? 0)]))
}

function fineDeltas(allocations: AllocationInput[]): Map<string, number> {
  const deltas = new Map<string, number>()
  for (const a of allocations) {
    if (a.targetKind !== 'fine' || a.fineId === undefined) continue
    deltas.set(a.fineId, (deltas.get(a.fineId) ?? 0) + a.amountCents)
  }
  return deltas
}

export async function lockFines(tx: Tx, allocations: AllocationInput[]): Promise<void> {
  const ids = [...fineDeltas(allocations).keys()]
  if (ids.length === 0) return
  await tx
    .select({ id: enforcementFines.id })
    .from(enforcementFines)
    .where(inArray(enforcementFines.id, ids))
    .orderBy(enforcementFines.id)
    .for('update')
}

export async function exceedsFineDue(tx: Tx, allocations: AllocationInput[]): Promise<boolean> {
  for (const [fineId, delta] of fineDeltas(allocations)) {
    if (delta > 0 && delta > (await fineDueCents(tx, fineId))) return true
  }
  return false
}
