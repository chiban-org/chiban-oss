import type { CeaseAndDesistRule } from '@packs/nh/schema'
import { asc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  enforcementAppeals,
  enforcementFines,
  enforcementOrders,
  orderCourtSteps,
  perilCertifications,
  restrainingOrders,
  users,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { loadPanelDocuments, type PanelDocument } from '@/features/documents/panelData'
import { getCase, type StaffCaseView } from '@/features/enforcement/access'
import { answerDueOf } from '@/features/enforcement/answers'
import { fineBalance } from '@/features/enforcement/fines'
import { type MotionBlock, motionBlocks } from '@/features/enforcement/motionGate'
import { type PenaltyExposure, penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { enforcementRulesFor } from '@/features/enforcement/ruleLinks'
import type { SuggestionsByKind } from '@/features/enforcement/sections/suggestions'
import {
  loadServiceState,
  orderRule,
  type ServiceState,
  statusOf,
} from '@/features/enforcement/service'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import { type StayState, stayBanner, stayFor } from '@/features/enforcement/stay'
import type { CasePayments } from '@/features/payments/casePayments'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface OrderDetail {
  row: typeof enforcementOrders.$inferSelect
  rule: CeaseAndDesistRule
  service: ServiceState
  status: ServiceStatus
  steps: (typeof orderCourtSteps.$inferSelect)[]
  gate: { open: true } | { open: false; blocks: MotionBlock[] }
  answerDues: { recipientId: string; name: string; due: SubjectDue; answeredOn: string | null }[]
  appealDue: SubjectDue | null
}

export interface AppealDetail {
  row: typeof enforcementAppeals.$inferSelect
  certification: typeof perilCertifications.$inferSelect | null
  restraints: (typeof restrainingOrders.$inferSelect)[]
}

export interface CaseDetail {
  staff: StaffCaseView
  today: CivilDate
  stay: StayState
  banner: string | null
  findings: (typeof violationFindings.$inferSelect)[]
  notices: (typeof violationNotices.$inferSelect)[]
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
  payments?: CasePayments | null
}

export function buildOrderDetail(
  row: typeof enforcementOrders.$inferSelect,
  service: ServiceState,
  steps: (typeof orderCourtSteps.$inferSelect)[],
  stay: StayState,
  today: CivilDate,
): OrderDetail {
  const rule = orderRule(row)
  const status = statusOf(rule, service)
  const filed = steps
    .filter((s) => s.kind === 'filed_with_clerk')
    .map((s) => s.occurredOn)
    .sort()[0]
  const gate = motionBlocks({
    rule,
    status,
    recipients: service.recipients.map((r) => ({
      answerDue: answerDueOf(r.row),
      answeredOn: r.row.answeredOn as CivilDate | null,
      served: status.servedOn[r.id] !== undefined,
    })),
    filedWithClerkOn: (filed ?? null) as CivilDate | null,
    stay,
    today,
  })
  const judgment = steps.find((s) => s.kind === 'judgment')
  return {
    row,
    rule,
    service,
    status,
    steps,
    gate: gate.length === 0 ? { open: true } : { open: false, blocks: gate },
    answerDues: service.recipients.flatMap((r) => {
      const due = answerDueOf(r.row)
      return due === null
        ? []
        : [{ recipientId: r.id, name: r.name, due, answeredOn: r.row.answeredOn }]
    }),
    appealDue:
      judgment?.appealDue === undefined || judgment.appealDue === null
        ? null
        : (judgment.appealDue as SubjectDue),
  }
}

async function orderDetail(
  db: DbOrTx,
  row: typeof enforcementOrders.$inferSelect,
  stay: StayState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<OrderDetail> {
  const service = await loadServiceState(db, row.id, signal)
  const steps = await db.select().from(orderCourtSteps).where(eq(orderCourtSteps.orderId, row.id))
  return buildOrderDetail(row, service, steps, stay, today)
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

function earliestConviction(
  courtJudgment: CivilDate | null,
  outcomes: { kind: string; occurredOn: string }[],
): CivilDate | null {
  const won = outcomes.filter((o) => o.kind === 'judgment_for_town').map((o) => o.occurredOn)
  return ([courtJudgment, ...won].filter((x) => x !== null).sort()[0] ?? null) as CivilDate | null
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
  const [findings, notices, orderRows, appealRows, fineRows, referralRows] = await Promise.all([
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
  const orders = await Promise.all(orderRows.map((o) => orderDetail(db, o, stay, today, signal)))
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
  const first = orders.find((o) => o.row.status !== 'draft')
  const notice =
    notices
      .map((n) => n.receivedOn)
      .filter((d): d is string => d !== null)
      .sort()[0] ?? null
  const penalty = first === undefined ? null : enforcementRulesFor(first.rule).penalty
  const judgment = orders
    .flatMap((o) => o.steps)
    .find((s) => s.kind === 'judgment' && s.judgmentOutcome !== 'annulled')
  const certified =
    appeals.find((a) => a.certification !== null)?.certification?.certifiedOn ?? null
  return ok({
    staff: view.value,
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
    orders,
    appeals,
    fines,
    referrals: referralRows.map((row) => ({
      row,
      outcomes: outcomes.filter((o) => o.referralId === row.id),
    })),
    exposure:
      penalty === null
        ? null
        : penaltyExposure(penalty, {
            noticeReceivedOn: notice as CivilDate | null,
            convictedOn: earliestConviction(
              (judgment?.occurredOn ?? null) as CivilDate | null,
              outcomes,
            ),
            through: today,
            offense: 'first',
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
