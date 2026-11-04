import type { CivilPenaltyRule } from '@packs/nh/schema'
import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  documents,
  enforcementAppeals,
  enforcementCases,
  enforcementOrders,
  orderCourtSteps,
  orderServiceEvents,
  orderServiceRecipients,
  orderServiceRoleChecks,
  perilCertifications,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { answerDueOf } from '@/features/enforcement/answers'
import {
  APPEAL_OUTCOME_LABELS,
  APPEAL_TARGET_LABELS,
  CASE_STATUS_LABELS,
  COURT_STEP_LABELS,
  JUDGMENT_OUTCOME_LABELS,
  ORDER_STATUS_LABELS,
  PROVISION_KIND_LABELS,
  ROLE_CHECK_LABELS,
  ROLE_LABELS,
  SERVER_ROLE_LABELS,
  SERVICE_METHOD_LABELS,
} from '@/features/enforcement/labels'
import { PENALTY_EXPOSURE_LABEL, penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { enforcementRulesFor } from '@/features/enforcement/ruleLinks'
import { orderRule } from '@/features/enforcement/service'
import { stayBanner, stayFor } from '@/features/enforcement/stay'
import { documentFrame } from '@/features/pdf/documentFrame'
import { type PdfBlock, renderPdf } from '@/features/pdf/renderPdf'
import { townToday } from '@/features/town/today'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import type { CivilDate } from '@/types/civilDate'

async function serviceBlocks(
  db: DbOrTx,
  order: typeof enforcementOrders.$inferSelect,
): Promise<PdfBlock[]> {
  const [checks, recipients, events] = await Promise.all([
    db.select().from(orderServiceRoleChecks).where(eq(orderServiceRoleChecks.orderId, order.id)),
    db.select().from(orderServiceRecipients).where(eq(orderServiceRecipients.orderId, order.id)),
    db.select().from(orderServiceEvents).where(eq(orderServiceEvents.orderId, order.id)),
  ])
  const proofs = new Map<string, { title: string; createdAt: Date }>()
  for (const e of events) {
    const [doc] = await db
      .select({ title: documents.title, createdAt: documents.createdAt })
      .from(documents)
      .where(eq(documents.id, e.proofDocumentId))
    if (doc !== undefined) proofs.set(e.id, doc)
  }
  const nameOf = (id: string | null) => recipients.find((r) => r.id === id)?.name ?? 'Property'
  return [
    { kind: 'heading', text: `Service checklist for ${order.number}` },
    {
      kind: 'table',
      columns: ['Role', 'Result', 'Basis'],
      rows: checks.map((c) => [ROLE_LABELS[c.role], ROLE_CHECK_LABELS[c.outcome], c.basis]),
    },
    {
      kind: 'table',
      columns: ['Recipient', 'Role', 'Source'],
      rows: recipients.map((r) => [r.name, ROLE_LABELS[r.role], r.source]),
    },
    {
      kind: 'table',
      columns: ['Served', 'Method', 'Recipient', 'Served by', 'Proof'],
      rows: events.map((e) => [
        formatCivilDate(e.servedOn),
        SERVICE_METHOD_LABELS[e.method],
        nameOf(e.recipientId),
        e.serverName === null
          ? ''
          : `${e.serverName}${e.serverRole === null ? '' : `, ${SERVER_ROLE_LABELS[e.serverRole]}`}`,
        proofLine(proofs.get(e.id)),
      ]),
    },
    ...recipients.flatMap((r): PdfBlock[] => {
      const due = answerDueOf(r)
      if (due === null) return []
      const text = `${r.name}: answer due ${formatCivilDate(due.due)}${due.rolledFrom === null ? '' : ` (moved from ${formatCivilDate(due.rolledFrom)})`}. ${humanizeIsoDates(due.countingMethod)} ${due.consequence}${r.answeredOn === null ? '' : ` Answer received ${formatCivilDate(r.answeredOn)}.`}`
      return [{ kind: 'paragraph', text }]
    }),
  ]
}

function proofLine(proof: { title: string; createdAt: Date } | undefined): string {
  return proof === undefined
    ? ''
    : `${proof.title}, ${formatCivilDate(proof.createdAt.toISOString().slice(0, 10))}`
}

async function orderBlocks(
  db: DbOrTx,
  order: typeof enforcementOrders.$inferSelect,
): Promise<{ blocks: PdfBlock[]; judgmentOn: CivilDate | null; penaltyRule: CivilPenaltyRule }> {
  const rule = orderRule(order)
  const blocks: PdfBlock[] = [
    { kind: 'heading', text: `Order ${order.number}` },
    {
      kind: 'fields',
      rows: [
        { label: 'Status', value: ORDER_STATUS_LABELS[order.status] },
        { label: 'Authority', value: rule.citation.label },
        { label: 'Issued', value: order.issuedOn === null ? '' : formatCivilDate(order.issuedOn) },
        {
          label: 'Corrective action due',
          value: order.correctiveDeadline === null ? '' : formatCivilDate(order.correctiveDeadline),
        },
      ],
    },
    ...(await serviceBlocks(db, order)),
  ]
  const steps = await db.select().from(orderCourtSteps).where(eq(orderCourtSteps.orderId, order.id))
  if (steps.length > 0) blocks.push(courtStepTable(steps))
  const judgment = steps.find((s) => s.kind === 'judgment' && s.judgmentOutcome !== 'annulled')
  return {
    blocks,
    judgmentOn: judgment === undefined ? null : (judgment.occurredOn as CivilDate),
    penaltyRule: enforcementRulesFor(rule).penalty,
  }
}

function courtStepTable(steps: (typeof orderCourtSteps.$inferSelect)[]): PdfBlock {
  return {
    kind: 'table',
    columns: ['Court step', 'Date', 'Court', 'Docket', 'Result'],
    rows: steps.map((s) => [
      COURT_STEP_LABELS[s.kind],
      formatCivilDate(s.occurredOn),
      s.court,
      s.docket ?? '',
      s.judgmentOutcome === null ? '' : JUDGMENT_OUTCOME_LABELS[s.judgmentOutcome],
    ]),
  }
}

async function proofBlock(db: DbOrTx, caseId: string): Promise<PdfBlock> {
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

async function appealBlocks(
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

async function exposureBlocks(
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

async function townWinOn(db: DbOrTx, caseId: string): Promise<CivilDate | null> {
  const rows = await db
    .select({ on: counselOutcomes.occurredOn })
    .from(counselOutcomes)
    .innerJoin(counselReferrals, eq(counselReferrals.id, counselOutcomes.referralId))
    .where(and(eq(counselReferrals.caseId, caseId), eq(counselOutcomes.kind, 'judgment_for_town')))
  return (rows.map((r) => r.on).sort()[0] ?? null) as CivilDate | null
}

async function findingsBlocks(db: DbOrTx, caseId: string): Promise<PdfBlock[]> {
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

export async function buildCounselPacket(
  db: DbOrTx,
  caseId: string,
  referredOn: CivilDate,
  now: Date,
  signal: AbortSignal,
): Promise<Uint8Array> {
  signal.throwIfAborted()
  const [caseRow] = await db.select().from(enforcementCases).where(eq(enforcementCases.id, caseId))
  const today = await townToday(db, now, signal)
  const orders = await db
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.caseId, caseId))
  const blocks: PdfBlock[] = [
    {
      kind: 'fields',
      rows: [
        { label: 'Case', value: caseRow?.number ?? '' },
        { label: 'Property', value: caseRow?.locationText ?? '' },
        { label: 'Status', value: caseRow === undefined ? '' : CASE_STATUS_LABELS[caseRow.status] },
        { label: 'Opened', value: caseRow === undefined ? '' : formatCivilDate(caseRow.openedOn) },
        { label: 'Referred', value: formatCivilDate(referredOn) },
      ],
    },
    ...(await findingsBlocks(db, caseId)),
  ]
  let convictedOn: CivilDate | null = null
  let penaltyRule: CivilPenaltyRule | null = null
  for (const order of orders.filter((o) => o.status !== 'draft')) {
    const built = await orderBlocks(db, order)
    blocks.push(...built.blocks)
    convictedOn ??= built.judgmentOn
    penaltyRule ??= built.penaltyRule
  }
  blocks.push(await proofBlock(db, caseId), ...(await appealBlocks(db, caseId, today, signal)))
  convictedOn ??= await townWinOn(db, caseId)
  blocks.push(...(await exposureBlocks(db, { caseId, penaltyRule, convictedOn, today })))
  return await renderPdf({
    title: 'Packet for town counsel',
    subtitle: caseRow?.number ?? '',
    frame: await documentFrame(db, {}, signal),
    scale: 'document',
    blocks,
  })
}
