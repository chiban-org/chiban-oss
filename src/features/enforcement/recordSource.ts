import { and, asc, inArray, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { complaints, enforcementCases } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { enforcementCaseVisibleTo } from '@/features/enforcement/access'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import type { CivilDate } from '@/types/civilDate'

async function approvedTexts(db: DbOrTx, caseIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (caseIds.length === 0) return out
  const rows = await db
    .select({ caseId: complaints.caseId, text: complaints.descriptionPublic })
    .from(complaints)
    .where(and(inArray(complaints.caseId, caseIds), isNotNull(complaints.descriptionPublic)))
    .orderBy(asc(complaints.createdAt))
  for (const row of rows) {
    if (row.caseId === null || row.text === null) continue
    out.set(row.caseId, [...(out.get(row.caseId) ?? []), row.text])
  }
  return out
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
  const approved = await approvedTexts(
    db,
    rows.filter((r) => r.isPublic).map((r) => r.id),
  )
  return rows.map((row) => ({
    kind: 'enforcement_case',
    recordId: row.id,
    title: 'Code enforcement case',
    number: row.number,
    status: { label: CASE_STATUS_LABELS[row.status], chip: 'neutral' },
    date: row.openedOn as CivilDate,
    href: actor !== null && hasFullRecordAccess(actor) ? `/staff/enforcement/${row.id}` : null,
    note: row.isPublic ? [row.publicSummary, ...(approved.get(row.id) ?? [])].join(' ') : null,
  }))
}

export function registerEnforcementRecordSource(): void {
  registerParcelRecordSource({ kind: 'enforcement_case', summarize: summarizeCases })
}

registerEnforcementRecordSource()
