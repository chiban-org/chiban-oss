import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import {
  applications,
  enforcementCases,
  enforcementFines,
  ledgerAllocations,
  ledgerEntries,
  receipts,
} from '@/db/schema'
import { assessedLines, lineKey } from '@/features/ledger/lineTotals'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { documentFrame } from '@/features/pdf/documentFrame'
import type { PdfBlock } from '@/features/pdf/renderPdf'
import { publishedTemplate } from '@/features/templates/findTemplate'
import { type DocumentInput, renderDocumentOrDefault } from '@/features/templates/templateBlocks'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { err, ok, type Result } from '@/types/result'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  card_present: 'Card (counter)',
  card_online: 'Card (online)',
}

export const SIMULATED_NOTICE = 'SIMULATED: no card was charged.'

type Allocation = typeof ledgerAllocations.$inferSelect
type LabelCache = Map<string, Map<string, string>>

function kindLabel(a: Allocation): string | null {
  if (a.targetKind === 'convenience_fee') return 'Convenience fee'
  if (a.targetKind === 'fine') return 'Court-imposed fine'
  return a.targetKind === 'overpayment' ? 'Overpayment held' : null
}

async function feeLabel(db: DbOrTx, a: Allocation, labels: LabelCache): Promise<string> {
  const applicationId = a.applicationId ?? ''
  if (!labels.has(applicationId)) {
    const lines = await assessedLines(db, applicationId)
    labels.set(applicationId, new Map(lines.map((l) => [lineKey(l.stage, l.feeCode), l.label])))
  }
  return (
    kindLabel(a) ??
    labels.get(applicationId)?.get(lineKey(a.stage ?? '', a.feeCode ?? '')) ??
    a.feeCode ??
    ''
  )
}

async function fineCaseNumber(db: DbOrTx, a: Allocation): Promise<string> {
  if (a.fineId === null) return ''
  const [row] = await db
    .select({ number: enforcementCases.number })
    .from(enforcementFines)
    .innerJoin(enforcementCases, eq(enforcementCases.id, enforcementFines.caseId))
    .where(eq(enforcementFines.id, a.fineId))
  return row?.number ?? ''
}

export interface ReceiptLine {
  reference: string
  label: string
  amountCents: number
}

export async function receiptLines(
  db: DbOrTx,
  entryId: string,
  scope?: { applicationId: string },
): Promise<ReceiptLine[]> {
  const allocations = await db
    .select()
    .from(ledgerAllocations)
    .where(eq(ledgerAllocations.entryId, entryId))
  const lines: ReceiptLine[] = []
  const labels: LabelCache = new Map()
  for (const a of allocations) {
    const outOfScope =
      scope !== undefined && a.applicationId !== null && a.applicationId !== scope.applicationId
    if (outOfScope) continue
    if (a.applicationId === null) {
      lines.push({
        reference: await fineCaseNumber(db, a),
        label: kindLabel(a) ?? '',
        amountCents: a.amountCents,
      })
      continue
    }
    const [app] = await db
      .select({ number: applications.number })
      .from(applications)
      .where(eq(applications.id, a.applicationId))
    lines.push({
      reference: app?.number ?? '',
      label: await feeLabel(db, a, labels),
      amountCents: a.amountCents,
    })
  }
  return lines
}

async function lineRows(
  db: Db,
  entryId: string,
  scope?: { applicationId: string },
): Promise<{ rows: string[][]; totalCents: number }> {
  const lines = await receiptLines(db, entryId, scope)
  return {
    rows: lines.map((l) => [l.reference, l.label, formatCents(l.amountCents)]),
    totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
  }
}

export async function receiptDocumentInput(
  db: Db,
  receiptId: string,
  signal: AbortSignal,
  scope?: { applicationId: string },
): Promise<DocumentInput | null> {
  signal.throwIfAborted()
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId))
  if (receipt === undefined) return null
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.receiptId, receiptId))
  const settings = await getPaymentSettings(db, signal)
  const refund = receipt.kind === 'refund'
  const lines =
    entry === undefined ? { rows: [], totalCents: 0 } : await lineRows(db, entry.id, scope)
  const shownTotal = scope === undefined ? receipt.totalCents : lines.totalCents
  const method = entry === undefined ? '' : (METHOD_LABELS[entry.method] ?? entry.method)
  const fields = [
    { label: 'Receipt', value: receipt.number },
    { label: 'Date', value: formatCivilDate(receipt.businessDate) },
    { label: refund ? 'Refunded to' : 'Received from', value: receipt.payerName },
    {
      label: 'Method',
      value: entry?.checkNumber == null ? method : `${method}, check ${entry.checkNumber}`,
    },
    { label: refund ? 'Total refunded' : 'Total received', value: formatCents(shownTotal) },
    ...(receipt.tenderedCents === null
      ? []
      : [
          { label: 'Tendered', value: formatCents(receipt.tenderedCents) },
          { label: 'Change', value: formatCents(receipt.changeCents ?? 0) },
        ]),
  ]
  const notice: PdfBlock[] = receipt.simulated ? [{ kind: 'notice', text: SIMULATED_NOTICE }] : []
  return {
    ...(refund ? { title: 'Refund receipt' } : {}),
    subtitle: receipt.number,
    frame: await documentFrame(db, {}, signal),
    context: {
      values: {
        'receipt.number': receipt.number,
        'receipt.date': formatCivilDate(receipt.businessDate),
        'receipt.payerName': receipt.payerName,
        'receipt.total': formatCents(shownTotal),
        'receipt.footer': settings.receiptFooter,
      },
      sections: new Map<string, PdfBlock[]>([
        ['receipt.details', [{ kind: 'fields', rows: fields }]],
        [
          'receipt.lines',
          [{ kind: 'table', columns: ['Application', 'Fee', 'Amount'], rows: lines.rows }],
        ],
        ['receipt.simulatedNotice', notice],
      ]),
    },
  }
}

export async function buildReceiptPdf(
  db: Db,
  receiptId: string,
  signal: AbortSignal,
  scope?: { applicationId: string },
): Promise<Result<Uint8Array, 'not_found'>> {
  const input = await receiptDocumentInput(db, receiptId, signal, scope)
  if (input === null) return err('not_found')
  const template = await publishedTemplate(db, 'receipt', signal)
  return ok(await renderDocumentOrDefault('receipt', template, input))
}
