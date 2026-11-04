import type { CivilPenaltyRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  documents,
  type enforcementOrders,
  orderCourtSteps,
  orderServiceEvents,
  orderServiceRecipients,
  orderServiceRoleChecks,
} from '@/db/schema'
import { answerDueOf } from '@/features/enforcement/answers'
import {
  COURT_STEP_LABELS,
  JUDGMENT_OUTCOME_LABELS,
  ORDER_STATUS_LABELS,
  ROLE_CHECK_LABELS,
  ROLE_LABELS,
  SERVER_ROLE_LABELS,
  SERVICE_METHOD_LABELS,
} from '@/features/enforcement/labels'
import { enforcementRulesFor } from '@/features/enforcement/ruleLinks'
import { orderRule } from '@/features/enforcement/service'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
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

export async function orderBlocks(
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
