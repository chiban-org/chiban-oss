import type { CivilPenaltyRule } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  documents,
  enforcementAppeals,
  perilCertifications,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import {
  APPEAL_OUTCOME_LABELS,
  APPEAL_TARGET_LABELS,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import { PENALTY_EXPOSURE_LABEL, penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { stayBanner, stayFor } from '@/features/enforcement/stay'
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
      text: `${APPEAL_TARGET_LABELS[a.targetKind]} appealed to the ZBA by ${a.appellantName} on ${formatCivilDate(a.filedOn)}, ${outcome}.`,
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

export async function exposureBlocks(
  db: DbOrTx,
  input: {
    caseId: string
    penaltyRule: CivilPenaltyRule | null
    convictedOn: CivilDate | null
    today: CivilDate
  },
): Promise<PdfBlock[]> {
  if (input.penaltyRule === null) return []
  const rule = input.penaltyRule
  const notices = await db
    .select({ receivedOn: violationNotices.receivedOn })
    .from(violationNotices)
    .where(eq(violationNotices.caseId, input.caseId))
  const received = notices.flatMap((n) => (n.receivedOn === null ? [] : [n.receivedOn])).sort()[0]
  const exposure = penaltyExposure(rule, {
    noticeReceivedOn: (received ?? null) as CivilDate | null,
    convictedOn: input.convictedOn,
    through: input.today,
    offense: 'first',
  })
  return [
    { kind: 'heading', text: 'Penalty exposure' },
    {
      kind: 'fields',
      rows: [
        { label: 'Authority', value: rule.citation.label },
        {
          label: 'Accrual began',
          value: exposure.fromDate === null ? 'Not started' : formatCivilDate(exposure.fromDate),
        },
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
