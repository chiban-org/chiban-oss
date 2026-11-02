import { and, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementCases } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { enforcementCaseVisibleTo } from '@/features/enforcement/access'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import type { CivilDate } from '@/types/civilDate'

export async function summarizeCases(
  db: DbOrTx,
  ids: string[],
  viewer: Viewer,
  signal: AbortSignal,
): Promise<ParcelRecordSummary[]> {
  signal.throwIfAborted()
  const actor = viewer.kind === 'actor' ? viewer.actor : null
  const rows = await db
    .select()
    .from(enforcementCases)
    .where(and(inArray(enforcementCases.id, ids), enforcementCaseVisibleTo(actor)))
  return rows.map((row) => ({
    kind: 'enforcement_case',
    recordId: row.id,
    title: 'Code enforcement case',
    number: row.number,
    status: { label: CASE_STATUS_LABELS[row.status], chip: 'neutral' },
    date: row.openedOn as CivilDate,
    href: actor !== null && hasFullRecordAccess(actor) ? `/staff/enforcement/${row.id}` : null,
    note: row.isPublic ? row.publicSummary : null,
  }))
}

export function registerEnforcementRecordSource(): void {
  registerParcelRecordSource({ kind: 'enforcement_case', summarize: summarizeCases })
}

registerEnforcementRecordSource()
