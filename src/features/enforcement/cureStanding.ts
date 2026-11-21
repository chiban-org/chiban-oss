import { type CivilDate, compareCivil } from '@/types/civilDate'

export interface CureNoticeFact {
  findingIds: readonly string[]
  due: CivilDate
  returnReceiptOn: string | null
}

export interface CureStanding {
  due: CivilDate | null
  lapsedUncorrected: boolean
}

interface FindingFact {
  id: string
  status: string
}

function isOpen(findings: readonly FindingFact[], id: string): boolean {
  return findings.some((f) => f.id === id && f.status === 'open')
}

export function uncoveredOpenFindings(
  findings: readonly FindingFact[],
  notices: readonly CureNoticeFact[],
): string[] {
  const covered = new Set(notices.flatMap((n) => n.findingIds))
  return findings.filter((f) => f.status === 'open' && !covered.has(f.id)).map((f) => f.id)
}

export function cureStanding(
  findings: readonly FindingFact[],
  notices: readonly CureNoticeFact[],
  today: CivilDate,
): CureStanding {
  const pending = notices.filter((n) => n.findingIds.some((id) => isOpen(findings, id)))
  if (pending.length === 0) {
    const last =
      notices
        .map((n) => n.due)
        .sort(compareCivil)
        .at(-1) ?? null
    return { due: last, lapsedUncorrected: false }
  }
  const first = pending.map((n) => n.due).sort(compareCivil)[0] ?? null
  return { due: first, lapsedUncorrected: first !== null && compareCivil(today, first) > 0 }
}
