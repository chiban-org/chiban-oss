import { registerGate } from '@/features/gates/registry'
import { feeBalance } from '@/features/ledger/feeBalance'
import { formatCents } from '@/lib/money'

export const FEES_PAID_GATE_KEY = 'fees.paid'

registerGate({
  key: FEES_PAID_GATE_KEY,
  label: 'Fees paid',
  kind: 'administrative',
  appliesTo: ['issued'],
  boundBy: null,
  evaluate: async (tx, app, _today, signal) => {
    const balance = await feeBalance(tx, app.id, signal)
    if (balance.unknownAttempts > 0) {
      return { status: 'unknown', reason: 'A card payment outcome is unknown.' }
    }
    const due = balance.lines
      .filter((l) => l.stage !== 'at_renewal')
      .reduce((sum, l) => sum + l.dueCents, 0)
    if (due > 0) return { status: 'blocked', reason: `Fees due: ${formatCents(due)}.` }
    return { status: 'pass' }
  },
})
