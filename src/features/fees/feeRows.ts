import type { FeeComputation, FeeLineResult } from '@/features/fees/computeFees'
import type { FeeStage } from '@/features/fees/feeSchema'
import type { FeeBalanceLine } from '@/features/ledger/feeBalance'
import { formatCents } from '@/lib/money'

export interface FeeRow {
  key: string
  label: string
  stageText: string | null
  assessedText: string
  paidCents: number | null
  dueCents: number | null
  explanation: string[]
  preview: boolean
}

export interface AssessmentLike {
  id: string
  stage: string
  computation: FeeComputation
}

export const FEE_STAGE_TEXT: Record<FeeStage, string> = {
  at_intake: 'Due at intake',
  at_approval: 'Due at approval',
  at_renewal: 'Due at renewal',
  at_notice: 'Due with notice',
}

const STAGES: ReadonlyMap<string, string> = new Map(Object.entries(FEE_STAGE_TEXT))

const PREVIEW_TEXT = 'Next assessment, not yet due'

export function amountText(line: FeeLineResult): string {
  const { amount } = line
  if ('pending' in amount) return `Pending: ${amount.pending}`
  if (amount.source === 'manual_override' && amount.replaced !== null) {
    return amount.value === 0
      ? `Waived (was ${formatCents(amount.replaced.value)})`
      : `${formatCents(amount.value)} (was ${formatCents(amount.replaced.value)})`
  }
  return formatCents(amount.value)
}

export function feeRows(
  assessments: readonly AssessmentLike[],
  balance: readonly FeeBalanceLine[] | null,
  preview: FeeComputation | null,
): FeeRow[] {
  const filled = assessments.filter((a) => a.computation.lines.length > 0)
  const showStage = new Set(filled.map((a) => a.stage)).size > 1
  const assessed = filled.flatMap((a) =>
    a.computation.lines.map((line): FeeRow => {
      const paid = balance?.find((b) => b.feeAssessmentId === a.id && b.feeCode === line.code)
      return {
        key: `${a.id}-${line.code}`,
        label: line.label,
        stageText: showStage ? (STAGES.get(a.stage) ?? null) : null,
        assessedText: amountText(line),
        paidCents: balance === null ? null : (paid?.paidCents ?? 0),
        dueCents: balance === null ? null : (paid?.dueCents ?? 0),
        explanation: line.explanation,
        preview: false,
      }
    }),
  )
  const upcoming = (preview?.lines ?? []).map(
    (line): FeeRow => ({
      key: `preview-${line.code}`,
      label: line.label,
      stageText: PREVIEW_TEXT,
      assessedText: amountText(line),
      paidCents: null,
      dueCents: null,
      explanation: line.explanation,
      preview: true,
    }),
  )
  return [...assessed, ...upcoming]
}
