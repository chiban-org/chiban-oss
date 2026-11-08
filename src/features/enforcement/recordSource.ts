import { and, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementCases } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import {
  enforcementCaseVisibleTo,
  type PublicCaseView,
  publicExtras,
} from '@/features/enforcement/access'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { caseChip, caseOpenGroup } from '@/features/parcels/openGroups'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const CASE_TITLE = 'Code enforcement case'

type CaseRow = typeof enforcementCases.$inferSelect

function publicNote(
  row: CaseRow,
  extras: Pick<PublicCaseView, 'approvedComplaintText' | 'provisions' | 'orders'>,
): string {
  const dates = `Opened ${formatCivilDate(row.openedOn)}${row.closedOn === null ? '' : `, closed ${formatCivilDate(row.closedOn)}`}.`
  const provisions =
    extras.provisions.length === 0 ? [] : [`Provisions cited: ${extras.provisions.join('; ')}.`]
  const orders =
    extras.orders.length === 0
      ? []
      : [
          `Orders issued: ${extras.orders.map((o) => `${o.number} on ${formatCivilDate(o.issuedOn)}`).join(', ')}.`,
        ]
  return [row.publicSummary ?? '', ...extras.approvedComplaintText, dates, ...provisions, ...orders]
    .filter((part) => part !== '')
    .join(' ')
}

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
  const notes = new Map<string, string>()
  for (const row of rows.filter((r) => r.isPublic)) {
    notes.set(row.id, publicNote(row, await publicExtras(db, row.id)))
  }
  return rows.map((row) => ({
    kind: 'enforcement_case',
    recordId: row.id,
    title: CASE_TITLE,
    type: { key: 'enforcement_case', label: CASE_TITLE },
    number: row.number,
    status: { label: CASE_STATUS_LABELS[row.status], chip: caseChip(row.status) },
    closed: caseOpenGroup(row.status) === null,
    openAs: caseOpenGroup(row.status),
    date: row.openedOn as CivilDate,
    dates: {
      filed: row.openedOn as CivilDate,
      issued: null,
      expires: null,
      closed: row.closedOn as CivilDate | null,
    },
    href: actor !== null && hasFullRecordAccess(actor) ? `/staff/enforcement/${row.id}` : null,
    note: notes.get(row.id) ?? null,
  }))
}

export function registerEnforcementRecordSource(): void {
  registerParcelRecordSource({ kind: 'enforcement_case', summarize: summarizeCases })
}

registerEnforcementRecordSource()
