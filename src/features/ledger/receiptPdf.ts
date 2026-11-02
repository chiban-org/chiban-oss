import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, ledgerAllocations, ledgerEntries, receipts } from '@/db/schema'
import { assessedLines, lineKey } from '@/features/ledger/lineTotals'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { renderPdf } from '@/features/pdf/renderPdf'
import { getTownSettings } from '@/features/town/settings'
import { formatCents } from '@/lib/money'
import { err, ok, type Result } from '@/types/result'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  card_present: 'Card (counter)',
  card_online: 'Card (online)',
}

export const SIMULATED_NOTICE = 'SIMULATED: no card was charged.'

async function lineRows(db: Db, entryId: string): Promise<string[][]> {
  const allocations = await db
    .select()
    .from(ledgerAllocations)
    .where(eq(ledgerAllocations.entryId, entryId))
  const rows: string[][] = []
  const labels = new Map<string, Map<string, string>>()
  for (const a of allocations) {
    if (a.applicationId === null) {
      rows.push([
        '',
        a.targetKind === 'overpayment' ? 'Overpayment held' : 'Convenience fee',
        formatCents(a.amountCents),
      ])
      continue
    }
    if (!labels.has(a.applicationId)) {
      const lines = await assessedLines(db, a.applicationId)
      labels.set(a.applicationId, new Map(lines.map((l) => [lineKey(l.stage, l.feeCode), l.label])))
    }
    const [app] = await db
      .select({ number: applications.number })
      .from(applications)
      .where(eq(applications.id, a.applicationId))
    const label =
      a.targetKind === 'convenience_fee'
        ? 'Convenience fee'
        : a.targetKind === 'overpayment'
          ? 'Overpayment held'
          : (labels.get(a.applicationId)?.get(lineKey(a.stage ?? '', a.feeCode ?? '')) ??
            a.feeCode ??
            '')
    rows.push([app?.number ?? '', label, formatCents(a.amountCents)])
  }
  return rows
}

export async function buildReceiptPdf(
  db: Db,
  receiptId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'not_found'>> {
  signal.throwIfAborted()
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId))
  if (receipt === undefined) return err('not_found')
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.receiptId, receiptId))
  const town = await getTownSettings(db, signal)
  const settings = await getPaymentSettings(db, signal)
  const refund = receipt.kind === 'refund'
  const rows = entry === undefined ? [] : await lineRows(db, entry.id)
  const method = entry === undefined ? '' : (METHOD_LABELS[entry.method] ?? entry.method)
  const fields = [
    { label: 'Receipt', value: receipt.number },
    { label: 'Date', value: receipt.businessDate },
    { label: refund ? 'Refunded to' : 'Received from', value: receipt.payerName },
    {
      label: 'Method',
      value: entry?.checkNumber == null ? method : `${method}, check ${entry.checkNumber}`,
    },
    { label: refund ? 'Total refunded' : 'Total received', value: formatCents(receipt.totalCents) },
    ...(receipt.tenderedCents === null
      ? []
      : [
          { label: 'Tendered', value: formatCents(receipt.tenderedCents) },
          { label: 'Change', value: formatCents(receipt.changeCents ?? 0) },
        ]),
  ]
  return ok(
    await renderPdf({
      title: refund ? 'Refund receipt' : 'Payment receipt',
      subtitle: receipt.number,
      townName: town.ok ? town.value.name : '',
      scale: 'document',
      blocks: [
        { kind: 'fields', rows: fields },
        { kind: 'table', columns: ['Application', 'Fee', 'Amount'], rows },
        ...(receipt.simulated ? [{ kind: 'notice' as const, text: SIMULATED_NOTICE }] : []),
        ...(settings.receiptFooter === ''
          ? []
          : [{ kind: 'paragraph' as const, text: settings.receiptFooter }]),
      ],
    }),
  )
}
