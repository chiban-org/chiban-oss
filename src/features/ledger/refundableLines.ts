import type { Db } from '@/db/client'
import { feeBalance } from '@/features/ledger/feeBalance'
import { netAllocations } from '@/features/ledger/reversalAllocations'

export interface RefundableLine {
  applicationId: string
  label: string
  cents: number
}

const CONVENIENCE_FEE_LABEL = 'Card convenience fee'

export async function refundableLines(
  db: Db,
  entryId: string,
  applicationId: string,
): Promise<RefundableLine[]> {
  const net = (await netAllocations(db, entryId)).filter(
    (n) => n.cents > 0 && n.allocation.applicationId === applicationId,
  )
  if (net.length === 0) return []
  const balance = await feeBalance(db, applicationId, new AbortController().signal)
  return net.map((n) => ({
    applicationId,
    cents: n.cents,
    label:
      n.allocation.targetKind === 'convenience_fee'
        ? CONVENIENCE_FEE_LABEL
        : n.allocation.targetKind === 'overpayment'
          ? 'Overpayment'
          : (balance.lines.find(
              (l) => l.feeCode === n.allocation.feeCode && l.stage === n.allocation.stage,
            )?.label ??
            n.allocation.feeCode ??
            'Fee'),
  }))
}
