import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  cureNotices,
  documents,
  enforcementAppeals,
  enforcementCases,
  perilCertifications,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { casePenaltyExposure, casePenaltyOf } from '@/features/enforcement/casePenalty'
import { cureRules, earliestReturnReceipt } from '@/features/enforcement/cureRules'
import {
  APPEAL_OUTCOME_LABELS,
  APPEAL_TARGET_LABELS,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import { PENALTY_EXPOSURE_LABEL, penaltyRangeLines } from '@/features/enforcement/penaltyExposure'
import { stayBanner, stayFor } from '@/features/enforcement/stay'
import type { CivilPenaltyRule } from '@/features/packs/schema'
import { boardAbbrev } from '@/features/packs/vocabulary'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import type { CivilDate } from '@/types/civilDate'

export async function proofBlock(db: DbOrTx, caseId: string): Promise<PdfBlock> {
  const proofDocs = await db
    .select({ title: documents.title, createdAt: documents.createdAt })
    .from(documents)
    .where(
      and(
        eq(documents.recordKind, 'enforcement_case'),
        eq(documents.recordId, caseId),
        eq(documents.docKind, 'service_proof'),
      ),
    )
    .orderBy(documents.createdAt)
  return {
    kind: 'table',
    columns: ['Proof of service on file', 'Added'],
    rows: proofDocs.map((p) => [p.title, formatCivilDate(p.createdAt.toISOString().slice(0, 10))]),
  }
}

export function appealedToBoardText(
  target: string,
  appellantName: string,
  filedOn: string,
  outcome: string,
): string {
  return `${target} appealed to the ${boardAbbrev('zba')} by ${appellantName} on ${formatCivilDate(filedOn)}, ${outcome}.`
}

export async function appealBlocks(
  db: DbOrTx,
  caseId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<PdfBlock[]> {
  const appeals = await db
    .select()
    .from(enforcementAppeals)
    .where(eq(enforcementAppeals.caseId, caseId))
  const certifications =
    appeals.length === 0
      ? []
      : await db
          .select()
          .from(perilCertifications)
          .where(
            inArray(
              perilCertifications.appealId,
              appeals.map((a) => a.id),
            ),
          )
  const blocks: PdfBlock[] = [{ kind: 'heading', text: 'Appeals and stays' }]
  if (appeals.length === 0) blocks.push({ kind: 'paragraph', text: 'No appeals have been filed.' })
  for (const a of appeals) {
    const outcome =
      a.outcome === null ? 'unresolved' : APPEAL_OUTCOME_LABELS[a.outcome].toLowerCase()
    blocks.push({
      kind: 'paragraph',
      text: appealedToBoardText(
        APPEAL_TARGET_LABELS[a.targetKind],
        a.appellantName,
        a.filedOn,
        outcome,
      ),
    })
    for (const c of certifications.filter((x) => x.appealId === a.id)) {
      blocks.push({
        kind: 'paragraph',
        text: `Imminent peril certified ${formatCivilDate(c.certifiedOn)}: ${c.statement}`,
      })
    }
  }
  const stay = await stayFor(db, caseId, today, signal)
  const filedOn = (appeals[0]?.filedOn ?? null) as CivilDate | null
  const certifiedOn = (certifications[0]?.certifiedOn ?? null) as CivilDate | null
  const banner = stayBanner(stay, filedOn, certifiedOn)
  if (banner !== null) blocks.push({ kind: 'notice', text: banner })
  return blocks
}

async function caseCureRuleKey(db: DbOrTx, caseId: string): Promise<string | null> {
  if (cureRules().length === 0) return null
  const [caseRow] = await db
    .select({ cureRuleKey: enforcementCases.cureRuleKey })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  return caseRow?.cureRuleKey ?? null
}

async function cureReceipt(db: DbOrTx, caseId: string): Promise<CivilDate | null> {
  return earliestReturnReceipt(
    await db
      .select({ returnReceiptOn: cureNotices.returnReceiptOn })
      .from(cureNotices)
      .where(eq(cureNotices.caseId, caseId)),
  )
}

async function noticeReceipt(db: DbOrTx, caseId: string): Promise<CivilDate | null> {
  const rows = await db
    .select({ receivedOn: violationNotices.receivedOn })
    .from(violationNotices)
    .where(eq(violationNotices.caseId, caseId))
  return (rows.flatMap((n) => (n.receivedOn === null ? [] : [n.receivedOn])).sort()[0] ??
    null) as CivilDate | null
}

export async function exposureBlocks(
  db: DbOrTx,
  input: {
    caseId: string
    penaltyRule: CivilPenaltyRule | null
    convictedOn: CivilDate | null
    today: CivilDate
  },
): Promise<PdfBlock[]> {
  const cureKey = input.penaltyRule === null ? await caseCureRuleKey(db, input.caseId) : null
  const penalty = casePenaltyOf(input.penaltyRule, cureKey)
  if (penalty === null) return []
  const { rule } = penalty
  const viaCure = penalty.source === 'cure'
  const exposure = casePenaltyExposure(penalty, {
    noticeReceivedOn: viaCure ? null : await noticeReceipt(db, input.caseId),
    cureReceiptOn: viaCure ? await cureReceipt(db, input.caseId) : null,
    convictedOn: input.convictedOn,
    today: input.today,
  })
  if (exposure === null) return []
  const accrual = {
    label: 'Accrual began',
    value:
      exposure.fromDate === null
        ? exposure.kind === 'range' && exposure.noAccrualRule === true
          ? 'None recorded'
          : 'Not started'
        : formatCivilDate(exposure.fromDate),
  }
  if (exposure.kind === 'range') {
    return [
      { kind: 'heading', text: 'Penalty exposure' },
      {
        kind: 'fields',
        rows: [
          { label: 'Authority', value: rule.citation.label },
          accrual,
          { label: 'Days', value: String(exposure.days) },
        ],
      },
      { kind: 'heading', text: exposure.label },
      ...penaltyRangeLines(exposure).map((text): PdfBlock => ({ kind: 'paragraph', text })),
    ]
  }
  return [
    { kind: 'heading', text: 'Penalty exposure' },
    {
      kind: 'fields',
      rows: [
        { label: 'Authority', value: rule.citation.label },
        accrual,
        { label: 'Days', value: String(exposure.days) },
        { label: 'Estimated exposure', value: formatCents(exposure.cents) },
      ],
    },
    { kind: 'notice', text: PENALTY_EXPOSURE_LABEL },
  ]
}

export async function townWinOn(db: DbOrTx, caseId: string): Promise<CivilDate | null> {
  const rows = await db
    .select({ on: counselOutcomes.occurredOn })
    .from(counselOutcomes)
    .innerJoin(counselReferrals, eq(counselReferrals.id, counselOutcomes.referralId))
    .where(and(eq(counselReferrals.caseId, caseId), eq(counselOutcomes.kind, 'judgment_for_town')))
  return (rows.map((r) => r.on).sort()[0] ?? null) as CivilDate | null
}

export async function findingsBlocks(db: DbOrTx, caseId: string): Promise<PdfBlock[]> {
  const [findings, notices] = await Promise.all([
    db.select().from(violationFindings).where(eq(violationFindings.caseId, caseId)),
    db.select().from(violationNotices).where(eq(violationNotices.caseId, caseId)),
  ])
  return [
    { kind: 'heading', text: 'Findings' },
    {
      kind: 'table',
      columns: ['Provision', 'Facts', 'Inspected'],
      rows: findings.map((f) => [
        `${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`,
        f.facts,
        formatCivilDate(f.inspectionDate),
      ]),
    },
    {
      kind: 'table',
      columns: ['Notice sent', 'Received'],
      rows: notices.map((n) => [
        formatCivilDate(n.sentOn),
        n.receivedOn === null ? 'Not recorded' : formatCivilDate(n.receivedOn),
      ]),
    },
  ]
}
