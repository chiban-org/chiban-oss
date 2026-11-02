import { and, asc, desc, eq, lt, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  complaints,
  type EnforcementStatus,
  enforcementCases,
  enforcementNotes,
  enforcementOrders,
  violationFindings,
} from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'
import { CASE_STATUS_LABELS, PROVISION_KIND_LABELS } from '@/features/enforcement/labels'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export function enforcementCaseVisibleTo(actor: Actor | null): SQL {
  if (actor !== null && hasFullRecordAccess(actor)) return sql`true`
  return sql`${enforcementCases.isPublic}`
}

export interface PublicCaseView {
  kind: 'public'
  caseId: string
  number: string
  statusLabel: string
  openedOn: CivilDate
  closedOn: CivilDate | null
  summary: string
  approvedComplaintText: string[]
  provisions: string[]
  orders: { number: string; issuedOn: CivilDate }[]
}

export interface StaffCaseView {
  kind: 'staff'
  row: typeof enforcementCases.$inferSelect
  complaints: (typeof complaints.$inferSelect)[]
  notes: (typeof enforcementNotes.$inferSelect)[]
}

export type CaseView = PublicCaseView | StaffCaseView

export function publicCaseView(
  row: typeof enforcementCases.$inferSelect,
  extras: Pick<PublicCaseView, 'approvedComplaintText' | 'provisions' | 'orders'>,
): PublicCaseView {
  return {
    kind: 'public',
    caseId: row.id,
    number: row.number,
    statusLabel: CASE_STATUS_LABELS[row.status],
    openedOn: row.openedOn as CivilDate,
    closedOn: row.closedOn as CivilDate | null,
    summary: row.publicSummary ?? '',
    ...extras,
  }
}

export async function publicExtras(
  db: DbOrTx,
  caseId: string,
): Promise<Pick<PublicCaseView, 'approvedComplaintText' | 'provisions' | 'orders'>> {
  const [texts, findings, orders] = await Promise.all([
    db
      .select({ text: complaints.descriptionPublic })
      .from(complaints)
      .where(and(eq(complaints.caseId, caseId), sql`${complaints.descriptionPublic} is not null`))
      .orderBy(asc(complaints.createdAt)),
    db
      .select({ kind: violationFindings.provisionKind, ref: violationFindings.provisionRef })
      .from(violationFindings)
      .where(eq(violationFindings.caseId, caseId))
      .orderBy(asc(violationFindings.foundOn)),
    db
      .select({ number: enforcementOrders.number, issuedOn: enforcementOrders.issuedOn })
      .from(enforcementOrders)
      .where(
        and(eq(enforcementOrders.caseId, caseId), sql`${enforcementOrders.issuedOn} is not null`),
      )
      .orderBy(asc(enforcementOrders.number)),
  ])
  return {
    approvedComplaintText: texts.flatMap((r) => (r.text === null ? [] : [r.text])),
    provisions: findings.map((f) => `${PROVISION_KIND_LABELS[f.kind]}: ${f.ref}`),
    orders: orders.flatMap((o) =>
      o.issuedOn === null ? [] : [{ number: o.number, issuedOn: o.issuedOn as CivilDate }],
    ),
  }
}

export async function getCase(
  db: DbOrTx,
  actor: Actor | null,
  caseId: string,
  signal: AbortSignal,
): Promise<Result<CaseView, 'not_found'>> {
  signal.throwIfAborted()
  const [row] = await db
    .select()
    .from(enforcementCases)
    .where(and(eq(enforcementCases.id, caseId), enforcementCaseVisibleTo(actor)))
  if (row === undefined) return err('not_found')
  if (actor === null || !hasFullRecordAccess(actor)) {
    return ok(publicCaseView(row, await publicExtras(db, row.id)))
  }
  const [caseComplaints, notes] = await Promise.all([
    db
      .select()
      .from(complaints)
      .where(eq(complaints.caseId, row.id))
      .orderBy(asc(complaints.createdAt)),
    db
      .select()
      .from(enforcementNotes)
      .where(eq(enforcementNotes.caseId, row.id))
      .orderBy(asc(enforcementNotes.createdAt)),
  ])
  return ok({ kind: 'staff', row, complaints: caseComplaints, notes })
}

export interface CaseListFilters {
  status?: EnforcementStatus
}

export interface CaseListRow {
  caseId: string
  number: string
  statusLabel: string
  locationText: string
  openedOn: CivilDate
  isPublic: boolean
  summary: string | null
}

export async function listCases(
  db: DbOrTx,
  actor: Actor | null,
  input: { filters: CaseListFilters; limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<{ rows: CaseListRow[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(enforcementCases)
    .where(
      and(
        enforcementCaseVisibleTo(actor),
        input.filters.status === undefined
          ? undefined
          : eq(enforcementCases.status, input.filters.status),
        input.cursor === undefined ? undefined : lt(enforcementCases.number, input.cursor),
      ),
    )
    .orderBy(desc(enforcementCases.number))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    rows: page.map((r) => ({
      caseId: r.id,
      number: r.number,
      statusLabel: CASE_STATUS_LABELS[r.status],
      locationText: r.locationText,
      openedOn: r.openedOn as CivilDate,
      isPublic: r.isPublic,
      summary: r.publicSummary,
    })),
    nextCursor: rows.length > input.limit && last !== undefined ? last.number : null,
  }
}
