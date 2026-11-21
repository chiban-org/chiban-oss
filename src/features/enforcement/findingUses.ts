import type { OrderStatus } from '@/db/schema'
import { formatCivilDate } from '@/lib/formatDate'

interface UseSources {
  notices: readonly { findingIds: readonly string[]; sentOn: string }[]
  cure?: { notices: readonly { findingIds: readonly string[]; sentOn: string }[] }
  orders: readonly {
    row: {
      findingIds: readonly string[]
      number: string
      status: OrderStatus
      issuedOn: string | null
    }
  }[]
}

export type FindingUses = ReadonlyMap<string, readonly string[]>

function orderPhrase(row: UseSources['orders'][number]['row']): string {
  if (row.status === 'draft' || row.issuedOn === null) return `In draft order ${row.number}`
  return `In order ${row.number}, issued ${formatCivilDate(row.issuedOn)}`
}

function curePhrase(n: { sentOn: string }): string {
  return `In the cure notice sent ${formatCivilDate(n.sentOn)}`
}

export function findingUses(sources: UseSources): FindingUses {
  const uses = new Map<string, string[]>()
  const add = (ids: readonly string[], phrase: string) => {
    for (const id of ids) uses.set(id, [...(uses.get(id) ?? []), phrase])
  }
  for (const n of sources.notices)
    add(n.findingIds, `In the notice sent ${formatCivilDate(n.sentOn)}`)
  for (const phrase of new Set((sources.cure?.notices ?? []).map(curePhrase))) {
    const ids = (sources.cure?.notices ?? [])
      .filter((n) => curePhrase(n) === phrase)
      .flatMap((n) => n.findingIds)
    add([...new Set(ids)], phrase)
  }
  for (const o of sources.orders) add(o.row.findingIds, orderPhrase(o.row))
  return uses
}

export function mayEditFinding(
  finding: { id: string; status: string },
  uses: FindingUses,
): boolean {
  return finding.status === 'open' && !uses.has(finding.id)
}
