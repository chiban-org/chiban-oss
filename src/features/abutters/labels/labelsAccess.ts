import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { abutterLists } from '@/db/schema'
import { labelLines } from '@/features/abutters/labels/labelLines'
import { isSheetKey, LABEL_SHEETS } from '@/features/abutters/labels/labelSheets'
import { renderLabels } from '@/features/abutters/labels/renderLabels'
import type { ListSnapshot } from '@/features/abutters/queries'
import type { Actor } from '@/features/auth/actor'
import { NOT_FOUND, type PdfResponseData, pdfOk } from '@/features/pdf/pdfResponse'
import { mayManageAbutters } from '@/features/rosters/manage'

export async function labelsPdfResponse(
  db: Db,
  actor: Actor | null,
  listId: string,
  sheetParam: string | null,
  signal: AbortSignal,
): Promise<PdfResponseData> {
  signal.throwIfAborted()
  if (actor === null || !(await mayManageAbutters(db, actor.userId, signal))) return NOT_FOUND
  const [list] = await db.select().from(abutterLists).where(eq(abutterLists.id, listId))
  if (list?.status !== 'issued' || list.snapshot === null) return NOT_FOUND
  const sheet =
    LABEL_SHEETS[sheetParam !== null && isSheetKey(sheetParam) ? sheetParam : 'avery_5160']
  const snapshot = list.snapshot as ListSnapshot
  const labels = snapshot.recipients
    .filter((r) => r.mailingAddress !== null)
    .map((r) => labelLines(r.name, r.mailingAddress ?? ''))
  return pdfOk(await renderLabels(sheet, labels))
}
