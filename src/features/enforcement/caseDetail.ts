import { asc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  cureNotices,
  enforcementAppeals,
  enforcementFines,
  enforcementOrders,
  parcels,
  perilCertifications,
  restrainingOrders,
  users,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { loadPanelDocuments, type PanelDocument } from '@/features/documents/panelData'
import { getCase, type StaffCaseView } from '@/features/enforcement/access'
import {
  casePenaltyExposure,
  casePenaltyOf,
  earliestConviction,
} from '@/features/enforcement/casePenalty'
import { type CaseRemedies, factsOf, loadCaseRemedies } from '@/features/enforcement/caseRemedies'
import type { AttachableComplaint } from '@/features/enforcement/complaintCandidates'
import { cureRuleByKey, cureRules, earliestReturnReceipt } from '@/features/enforcement/cureRules'
import { fineBalance } from '@/features/enforcement/fines'
import { loadOrderDetail, type OrderDetail } from '@/features/enforcement/orderDetail'
import type { PenaltyExposure } from '@/features/enforcement/penaltyExposure'
import { enforcementRulesFor } from '@/features/enforcement/ruleLinks'
import type { SuggestionsByKind } from '@/features/enforcement/sections/suggestions'
import { type StayState, stayBanner, stayFor } from '@/features/enforcement/stay'
import type { CureNoticeRule } from '@/features/packs/schema'
import type { CasePayments } from '@/features/payments/casePayments'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export { buildOrderDetail, type OrderDetail } from '@/features/enforcement/orderDetail'

export interface AppealDetail {
  row: typeof enforcementAppeals.$inferSelect
  certification: typeof perilCertifications.$inferSelect | null
  restraints: (typeof restrainingOrders.$inferSelect)[]
}

export interface CureDetail {
  choices: { key: string; label: string }[]
  rule: CureNoticeRule | null
  notices: (typeof cureNotices.$inferSelect & { due: CivilDate })[]
  holdPlaced?: boolean
  civilActionFiled?: boolean
}

export interface ParcelOwner {
  name: string | null
  mailingAddress: string | null
}

export interface CaseDetail {
  staff: StaffCaseView
  parcelOwner: ParcelOwner | null
  today: CivilDate
  stay: StayState
  banner: string | null
  findings: (typeof violationFindings.$inferSelect)[]
  notices: (typeof violationNotices.$inferSelect)[]
  cure: CureDetail
  orders: OrderDetail[]
  appeals: AppealDetail[]
  fines: { row: typeof enforcementFines.$inferSelect; dueCents: number; paidCents: number }[]
  referrals: {
    row: typeof counselReferrals.$inferSelect
    outcomes: (typeof counselOutcomes.$inferSelect)[]
  }[]
  exposure: PenaltyExposure | null
  documents: PanelDocument[]
  names: Record<string, string>
  suggestions?: SuggestionsByKind
  buildingCodeOffered?: boolean
  attachable?: AttachableComplaint[]
  payments?: CasePayments | null
  remedies?: CaseRemedies
}

async function parcelOwnerOf(db: DbOrTx, parcelId: string | null): Promise<ParcelOwner | null> {
  if (parcelId === null) return null
  const [row] = await db
    .select({ name: parcels.ownerName, mailingAddress: parcels.mailingAddress })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
  return row ?? null
}

async function userNames(db: DbOrTx, ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return {}
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, unique))
  return Object.fromEntries(rows.map((r) => [r.id, r.name]))
}

export async function loadCaseDetail(
  db: DbOrTx,
  actor: Actor,
  caseId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<CaseDetail, 'not_found'>> {
  const view = await getCase(db, actor, caseId, signal)
  if (!view.ok || view.value.kind !== 'staff') return err('not_found')
  const stay = await stayFor(db, caseId, today, signal)
  const [findings, notices, cureRows, orderRows, appealRows, fineRows, referralRows] =
    await Promise.all([
      db
        .select()
        .from(violationFindings)
        .where(eq(violationFindings.caseId, caseId))
        .orderBy(asc(violationFindings.foundOn)),
      db
        .select()
        .from(violationNotices)
        .where(eq(violationNotices.caseId, caseId))
        .orderBy(asc(violationNotices.sentOn)),
      db
        .select()
        .from(cureNotices)
        .where(eq(cureNotices.caseId, caseId))
        .orderBy(asc(cureNotices.sentOn), asc(cureNotices.recipientRole)),
      db
        .select()
        .from(enforcementOrders)
        .where(eq(enforcementOrders.caseId, caseId))
        .orderBy(asc(enforcementOrders.number)),
      db
        .select()
        .from(enforcementAppeals)
        .where(eq(enforcementAppeals.caseId, caseId))
        .orderBy(asc(enforcementAppeals.filedOn)),
      db
        .select()
        .from(enforcementFines)
        .where(eq(enforcementFines.caseId, caseId))
        .orderBy(asc(enforcementFines.imposedOn)),
      db
        .select()
        .from(counselReferrals)
        .where(eq(counselReferrals.caseId, caseId))
        .orderBy(asc(counselReferrals.referredOn)),
    ])
  const orders = await Promise.all(
    orderRows.map((o) => loadOrderDetail(db, o, stay, today, signal)),
  )
  const appealIds = appealRows.map((a) => a.id)
  const [certs, restraints] =
    appealIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select()
            .from(perilCertifications)
            .where(inArray(perilCertifications.appealId, appealIds)),
          db.select().from(restrainingOrders).where(inArray(restrainingOrders.appealId, appealIds)),
        ])
  const appeals = appealRows.map((row) => ({
    row,
    certification: certs.find((c) => c.appealId === row.id) ?? null,
    restraints: restraints.filter((r) => r.appealId === row.id),
  }))
  const fines = await Promise.all(
    fineRows.map(async (row) => {
      const balance = await fineBalance(db, row.id, signal)
      return { row, dueCents: balance.dueCents, paidCents: balance.paidCents }
    }),
  )
  const outcomes =
    referralRows.length === 0
      ? []
      : await db
          .select()
          .from(counselOutcomes)
          .where(
            inArray(
              counselOutcomes.referralId,
              referralRows.map((r) => r.id),
            ),
          )
          .orderBy(asc(counselOutcomes.occurredOn))
  const remedies = await loadCaseRemedies(db, view.value.row, signal)
  const first = orders.find((o) => o.row.status !== 'draft')
  const notice =
    notices
      .map((n) => n.receivedOn)
      .filter((d): d is string => d !== null)
      .sort()[0] ?? null
  const penalty = casePenaltyOf(
    first === undefined ? null : enforcementRulesFor(first.rule).penalty,
    view.value.row.cureRuleKey,
  )
  const judgment = orders
    .flatMap((o) => o.steps)
    .find((s) => s.kind === 'judgment' && s.judgmentOutcome !== 'annulled')
  const certified =
    appeals.find((a) => a.certification !== null)?.certification?.certifiedOn ?? null
  return ok({
    staff: view.value,
    parcelOwner: await parcelOwnerOf(db, view.value.row.parcelId),
    today,
    stay,
    banner: stayBanner(
      stay,
      (appeals.find((a) => a.row.id === stay.appealId)?.row.filedOn ??
        appeals[0]?.row.filedOn ??
        null) as CivilDate | null,
      certified as CivilDate | null,
    ),
    findings,
    notices,
    cure: {
      choices: cureRules().map((r) => ({ key: r.key, label: r.label })),
      rule: cureRuleByKey(view.value.row.cureRuleKey),
      notices: cureRows.map((row) => ({ ...row, due: row.cureDue.due })),
      ...factsOf(remedies),
    },
    remedies,
    orders,
    appeals,
    fines,
    referrals: referralRows.map((row) => ({
      row,
      outcomes: outcomes.filter((o) => o.referralId === row.id),
    })),
    exposure: casePenaltyExposure(penalty, {
      noticeReceivedOn: notice as CivilDate | null,
      cureReceiptOn: earliestReturnReceipt(cureRows),
      convictedOn: earliestConviction((judgment?.occurredOn ?? null) as CivilDate | null, outcomes),
      today,
    }),
    documents: await loadPanelDocuments(
      db,
      actor,
      { kind: 'enforcement_case', id: caseId },
      signal,
    ),
    names: await userNames(db, [
      ...view.value.notes.map((n) => n.authorId),
      ...findings.map((f) => f.foundBy),
      ...findings.flatMap((f) => (f.withdrawnBy === null ? [] : [f.withdrawnBy])),
      ...orders.flatMap((o) => (o.row.issuedBy === null ? [] : [o.row.issuedBy])),
    ]),
  })
}
