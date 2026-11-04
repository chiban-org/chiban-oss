import { desc, eq } from 'drizzle-orm'
import { receipts, rtkRequests } from '@/db/schema'
import { receiptDocumentInput } from '@/features/ledger/receiptPdf'
import { responseLetterInput } from '@/features/rtk/responseLetter'
import { type PreviewSource, SAMPLE_LIMIT } from '@/features/templates/preview/previewTypes'
import { formatCivilDate } from '@/lib/formatDate'

export const RTK_RESPONSE_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: rtkRequests.id,
        number: rtkRequests.number,
        receivedOn: rtkRequests.receivedOn,
      })
      .from(rtkRequests)
      .orderBy(desc(rtkRequests.createdAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${r.number}, received ${formatCivilDate(r.receivedOn)}`,
    }))
  },
  async input({ db, signal }, id) {
    const [request] = await db
      .select({ id: rtkRequests.id })
      .from(rtkRequests)
      .where(eq(rtkRequests.id, id))
    return request === undefined ? null : await responseLetterInput(db, id, signal)
  },
}

export const RECEIPT_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({
        id: receipts.id,
        number: receipts.number,
        kind: receipts.kind,
        date: receipts.businessDate,
      })
      .from(receipts)
      .orderBy(desc(receipts.issuedAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${r.number}, ${r.kind === 'refund' ? 'refund' : 'payment'} on ${formatCivilDate(r.date)}`,
    }))
  },
  async input({ db, signal }, id) {
    return await receiptDocumentInput(db, id, signal)
  },
}
