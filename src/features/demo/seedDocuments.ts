import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { Db } from '@/db/client'
import { loadApplicationContext } from '@/features/applications/context'
import { gatedStages, unmetItems } from '@/features/applications/documentChecklist'
import { documentItemsOf } from '@/features/applications/documentItemSchema'
import { insertItemLink } from '@/features/applications/documentItems'
import { loadItemRecords } from '@/features/applications/documentRecords'
import type { CoreState } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { getObjectStore } from '@/features/storage/objectStore'

const PAGE: [number, number] = [612, 792]

let sheet: Promise<Uint8Array> | null = null

async function drawSheet(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage(PAGE)
  page.drawText('Demo plans and supporting documents', { x: 72, y: 700, size: 14, font })
  return await doc.save()
}

function sheetBytes(): Promise<Uint8Array> {
  sheet ??= drawSheet()
  return sheet
}

export interface DemoFiling {
  applicationId: string
  to: CoreState
  values?: Record<string, unknown>
}

export async function fileDemoDocuments(
  db: Db,
  actor: Actor,
  input: DemoFiling,
  signal: AbortSignal,
): Promise<void> {
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return
  const stages = gatedStages(input.to, app.typeBody.workflow.closesOn)
  const values = input.values ?? app.values
  const items = documentItemsOf(app.typeBody)
  if (unmetItems(items, stages, values).length === 0) return
  const records = await loadItemRecords(db, input.applicationId)
  const unmet = unmetItems(items, stages, values, records)
  if (unmet.length === 0) return
  const bytes = await sheetBytes()
  await db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, getObjectStore(), bytes, 'application/pdf', signal)
    const attached = await attachDocument(
      tx,
      actor,
      {
        target: { kind: 'application', id: input.applicationId },
        title: unmet.length === 1 ? (unmet[0]?.label ?? 'Plans') : 'Plans and supporting documents',
        docKind: 'attachment',
        file: { sha256: stored.sha256, filename: 'plans.pdf', contentType: 'application/pdf' },
      },
      signal,
    )
    for (const item of unmet) {
      await insertItemLink(
        tx,
        actor,
        { applicationId: input.applicationId, itemKey: item.key, documentId: attached.documentId },
        signal,
      )
    }
  })
}
