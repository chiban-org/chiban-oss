import { asc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  developmentHolds,
  enforcementCases,
  enforcementCivilActions,
  enforcementOrders,
} from '@/db/schema'
import { orderBlocks } from '@/features/enforcement/counselOrderBlocks'
import {
  appealBlocks,
  exposureBlocks,
  findingsBlocks,
  proofBlock,
  townWinOn,
} from '@/features/enforcement/counselSectionBlocks'
import { cureRules } from '@/features/enforcement/cureRules'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import type { CivilPenaltyRule } from '@/features/packs/schema'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

async function orderSection(
  db: DbOrTx,
  caseId: string,
): Promise<{
  blocks: PdfBlock[]
  convictedOn: CivilDate | null
  penaltyRule: CivilPenaltyRule | null
}> {
  const orders = await db
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.caseId, caseId))
  const blocks: PdfBlock[] = []
  let convictedOn: CivilDate | null = null
  let penaltyRule: CivilPenaltyRule | null = null
  for (const order of orders.filter((o) => o.status !== 'draft')) {
    const built = await orderBlocks(db, order)
    blocks.push(...built.blocks)
    convictedOn ??= built.judgmentOn
    penaltyRule ??= built.penaltyRule
  }
  return { blocks, convictedOn, penaltyRule }
}

async function remedyBlocks(db: DbOrTx, caseId: string): Promise<PdfBlock[]> {
  if (cureRules().length === 0) return []
  const [holds, civil] = await Promise.all([
    db
      .select()
      .from(developmentHolds)
      .where(eq(developmentHolds.caseId, caseId))
      .orderBy(asc(developmentHolds.placedOn)),
    db
      .select()
      .from(enforcementCivilActions)
      .where(eq(enforcementCivilActions.caseId, caseId))
      .orderBy(asc(enforcementCivilActions.filedOn)),
  ])
  if (holds.length === 0 && civil.length === 0) return []
  return [
    { kind: 'heading', text: 'Remedies' },
    ...holds.map(
      (h): PdfBlock => ({
        kind: 'fields',
        rows: [
          { label: 'Hold placed', value: formatCivilDate(h.placedOn) },
          {
            label: 'Hold released',
            value: h.releasedOn === null ? 'Not released' : formatCivilDate(h.releasedOn),
          },
        ],
      }),
    ),
    ...civil.map(
      (c): PdfBlock => ({
        kind: 'fields',
        rows: [
          { label: 'Civil action filed', value: formatCivilDate(c.filedOn) },
          { label: 'Court', value: c.court },
          { label: 'Docket', value: c.docket ?? 'Not recorded' },
        ],
      }),
    ),
  ]
}

export async function counselPacketInput(
  db: DbOrTx,
  caseId: string,
  referredOn: CivilDate,
  now: Date,
  signal: AbortSignal,
): Promise<DocumentInput> {
  signal.throwIfAborted()
  const [caseRow] = await db.select().from(enforcementCases).where(eq(enforcementCases.id, caseId))
  const today = await townToday(db, now, signal)
  const findings = await findingsBlocks(db, caseId)
  const orders = await orderSection(db, caseId)
  const remedies = await remedyBlocks(db, caseId)
  const proof = await proofBlock(db, caseId)
  const appeals = await appealBlocks(db, caseId, today, signal)
  const convictedOn = orders.convictedOn ?? (await townWinOn(db, caseId))
  const penalty = await exposureBlocks(db, {
    caseId,
    penaltyRule: orders.penaltyRule,
    convictedOn,
    today,
  })
  return {
    subtitle: caseRow?.number ?? '',
    frame: await documentFrame(db, {}, signal),
    context: {
      values: {
        'case.number': caseRow?.number ?? '',
        'case.property': caseRow?.locationText ?? '',
        'case.status': caseRow === undefined ? '' : CASE_STATUS_LABELS[caseRow.status],
        'case.openedOn': caseRow === undefined ? '' : formatCivilDate(caseRow.openedOn),
        'case.referredOn': formatCivilDate(referredOn),
      },
      sections: new Map([
        ['counsel.findings', findings],
        ['counsel.orders', [...orders.blocks, ...remedies]],
        ['counsel.proof', [proof]],
        ['counsel.appeals', appeals],
        ['counsel.penalty', penalty],
      ]),
    },
  }
}

export async function buildCounselPacket(
  db: DbOrTx,
  caseId: string,
  referredOn: CivilDate,
  now: Date,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const input = await counselPacketInput(db, caseId, referredOn, now, signal)
  const template = await publishedTemplate(db, 'counsel_packet_cover', signal)
  return await renderDocumentOrDefault('counsel_packet_cover', template, input)
}
