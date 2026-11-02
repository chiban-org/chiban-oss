import { eq } from 'drizzle-orm'
import * as mupdf from 'mupdf'
import sharp from 'sharp'
import type { PageGeometry } from '@/components/redaction/boxModel'
import type { DbOrTx } from '@/db/client'
import { documents, documentVersions, files } from '@/db/schema'
import { openPdf } from '@/features/redaction/verifyRedaction'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export const MAX_EDITOR_PAGES = 12
const EDITOR_WIDTH = 900

export interface EditorSource {
  documentId: string
  title: string
  versionId: string
  mode: 'pdf' | 'image'
  pages: PageGeometry[]
  truncated: boolean
}

const dataUrl = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`

export async function loadEditorSource(
  db: DbOrTx,
  store: ObjectStore,
  versionId: string,
  signal: AbortSignal,
): Promise<Result<EditorSource, 'not_found' | 'unsupported' | 'unreadable'>> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      documentId: documentVersions.documentId,
      role: documentVersions.role,
      contentType: documentVersions.contentType,
      title: documents.title,
      disposedAt: documents.disposedAt,
      storageKey: files.storageKey,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.id, versionId))
  if (row === undefined || row.disposedAt !== null) return err('not_found')
  if (row.role !== 'original' && row.role !== 'pdfa') return err('not_found')
  const stream = await store.getStream(row.storageKey, signal)
  if (!stream.ok) return err('unreadable')
  const bytes = new Uint8Array(await new Response(stream.value).arrayBuffer())
  if (row.contentType === 'application/pdf') {
    const doc = openPdf(bytes)
    if (doc === null || doc.needsPassword()) return err('unreadable')
    const count = doc.countPages()
    const pages: PageGeometry[] = []
    for (let i = 0; i < Math.min(count, MAX_EDITOR_PAGES); i += 1) {
      const page = doc.loadPage(i)
      const [x0, y0, x1, y1] = page.getBounds()
      const scale = EDITOR_WIDTH / (x1 - x0)
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      )
      pages.push({ page: i + 1, src: dataUrl(pixmap.asPNG()), width: x1 - x0, height: y1 - y0 })
    }
    return ok({
      documentId: row.documentId,
      title: row.title,
      versionId,
      mode: 'pdf',
      pages,
      truncated: count > MAX_EDITOR_PAGES,
    })
  }
  if (row.contentType === 'image/jpeg' || row.contentType === 'image/png') {
    try {
      const oriented = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true })
      const preview = await sharp(oriented.data)
        .resize({ width: EDITOR_WIDTH, withoutEnlargement: true })
        .png()
        .toBuffer()
      return ok({
        documentId: row.documentId,
        title: row.title,
        versionId,
        mode: 'image',
        pages: [
          {
            page: 1,
            src: dataUrl(preview),
            width: oriented.info.width,
            height: oriented.info.height,
          },
        ],
        truncated: false,
      })
    } catch {
      return err('unreadable')
    }
  }
  return err('unsupported')
}
