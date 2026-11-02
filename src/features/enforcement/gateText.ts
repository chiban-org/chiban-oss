import type { OrderDetail } from '@/features/enforcement/caseDetail'
import { MOTION_BLOCK_TEXT } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export function motionGateText(gate: OrderDetail['gate'], motionFiledOn: CivilDate | null): string {
  if (motionFiledOn !== null) {
    return `The motion to enforce was filed ${formatCivilDate(motionFiledOn)}.`
  }
  if (gate.open) return 'The motion to enforce can be filed.'
  const reasons = gate.blocks.map((b) =>
    typeof b === 'string'
      ? MOTION_BLOCK_TEXT[b]
      : `The motion can be filed no earlier than ${formatCivilDate(b.filingLeadUntil)}, five days after filing with the clerk.`,
  )
  return `The motion to enforce cannot be filed yet. ${reasons.join(' ')}`
}
