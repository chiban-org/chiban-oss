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

type Allocation = typeof ledgerAllocations.$inferSelect
type LabelCache = Map<string, Map<string, string>>

function kindLabel(a: Allocation): string | null {
  if (a.targetKind === 'convenience_fee') return 'Convenience fee'
  return a.targetKind === 'overpayment' ? 'Overpayment held' : null
}

async function feeLabel(db: Db, a: Allocation, labels: LabelCache): Promise<string> {
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

async function lineRows(
  db: Db,
  entryId: string,
  scope?: { applicationId: string },
): Promise<{ rows: string[][]; totalCents: number }> {
  const allocations = await db
    .select()
    .from(ledgerAllocations)
    .where(eq(ledgerAllocations.entryId, entryId))
  const rows: string[][] = []
  const labels: LabelCache = new Map()
  let totalCents = 0
  for (const a of allocations) {
    const outOfScope =
      scope !== undefined && a.applicationId !== null && a.applicationId !== scope.applicationId
    if (outOfScope) continue
    totalCents += a.amountCents
    if (a.applicationId === null) {
      rows.push(['', kindLabel(a) ?? '', formatCents(a.amountCents)])
      continue
    }
    const [app] = await db
      .select({ number: applications.number })
      .from(applications)
      .where(eq(applications.id, a.applicationId))
    rows.push([app?.number ?? '', await feeLabel(db, a, labels), formatCents(a.amountCents)])
  }
  return { rows, totalCents }
}

export async function buildReceiptPdf(
  db: Db,
  receiptId: string,
  signal: AbortSignal,
  scope?: { applicationId: string },
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
  const lines =
    entry === undefined ? { rows: [], totalCents: 0 } : await lineRows(db, entry.id, scope)
  const rows = lines.rows
  const shownTotal = scope === undefined ? receipt.totalCents : lines.totalCents
  const method = entry === undefined ? '' : (METHOD_LABELS[entry.method] ?? entry.method)
  const fields = [
    { label: 'Receipt', value: receipt.number },
    { label: 'Date', value: receipt.businessDate },
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
