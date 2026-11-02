import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { prorate } from '@/features/ledger/prorate'
import type { AllocationInput, AllocationTarget, FeeStageKey } from '@/features/ledger/types'

export function allocationKey(a: AllocationInput): string {
  return [a.targetKind, a.applicationId ?? '', a.stage ?? '', a.feeCode ?? ''].join('|')
}

export interface NetAllocation {
  key: string
  allocation: AllocationInput
  cents: number
}

interface NetRow extends Record<string, unknown> {
  target_kind: AllocationTarget
  application_id: string | null
  fee_assessment_id: string | null
  stage: FeeStageKey | null
  fee_code: string | null
  net: number
}

export async function netAllocations(tx: Tx, entryId: string): Promise<NetAllocation[]> {
  const result = await tx.execute<NetRow>(sql`
    with recursive tree as (
      select id from ledger_entries where id = ${entryId}
      union all
      select l.id from ledger_entries l join tree t on l.reverses_entry_id = t.id
    )
    select a.target_kind, a.application_id, min(a.fee_assessment_id::text) as fee_assessment_id,
      a.stage, a.fee_code, sum(a.amount_cents)::int as net
    from ledger_allocations a join tree t on a.entry_id = t.id
    group by a.target_kind, a.application_id, a.stage, a.fee_code
    order by a.target_kind, a.application_id, a.stage, a.fee_code
  `)
  return result.rows.map((r) => {
    const allocation: AllocationInput = {
      targetKind: r.target_kind,
      applicationId: r.application_id ?? undefined,
      feeAssessmentId: r.fee_assessment_id ?? undefined,
      stage: r.stage ?? undefined,
      feeCode: r.fee_code ?? undefined,
      amountCents: 0,
    }
    return { key: allocationKey(allocation), allocation, cents: r.net }
  })
}

export interface ReversalAllocation {
  allocations: AllocationInput[]
  excessCents: number
}

export async function allocateReversal(
  tx: Tx,
  entryId: string,
  amountCents: number,
): Promise<ReversalAllocation> {
  const net = await netAllocations(tx, entryId)
  const open = net.filter((n) => n.cents > 0)
  const remaining = open.reduce((sum, n) => sum + n.cents, 0)
  const covered = Math.min(amountCents, remaining)
  const shares =
    covered > 0
      ? prorate(
          covered,
          open.map((n) => ({ key: n.key, cents: n.cents })),
        )
      : []
  const allocations = shares.flatMap((share) => {
    const source = open.find((n) => n.key === share.key)
    return share.cents > 0 && source !== undefined
      ? [{ ...source.allocation, amountCents: -share.cents }]
      : []
  })
  const excessCents = amountCents - covered
  if (excessCents > 0) {
    allocations.push({
      targetKind: 'overpayment',
      applicationId: net[0]?.allocation.applicationId,
      amountCents: -excessCents,
    })
  }
  return { allocations, excessCents }
}
