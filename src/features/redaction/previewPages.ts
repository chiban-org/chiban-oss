import { eq } from 'drizzle-orm'
import * as mupdf from 'mupdf'
import sharp from 'sharp'
import type { PageGeometry } from '@/components/redaction/boxModel'
import type { DbOrTx } from '@/db/client'
import { documents, documentVersions, files } from '@/db/schema'
import { openPdf } from '@/features/redaction/verifyRedaction'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const EDITOR_WIDTH = 900

export interface EditorSource {
  documentId: string
  title: string
  versionId: string
  mode: 'pdf' | 'image'
  pages: PageGeometry[]
}

type SourceError = 'not_found' | 'unsupported' | 'unreadable'

const dataUrl = (bytes: Uint8Array) =>
  `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`

export function editorPageUrl(versionId: string, page: number): string {
  return `/staff/records/redact/${versionId}/pages/${page}`
}

async function editableVersion(
  db: DbOrTx,
  store: ObjectStore,
  versionId: string,
  signal: AbortSignal,
): Promise<
  Result<{ documentId: string; title: string; contentType: string; bytes: Uint8Array }, SourceError>
> {
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
  return ok({ documentId: row.documentId, title: row.title, contentType: row.contentType, bytes })
}

function openEditablePdf(bytes: Uint8Array): mupdf.PDFDocument | null {
  const doc = openPdf(bytes)
  return doc === null || doc.needsPassword() ? null : doc
}

export async function renderEditorPage(
  db: DbOrTx,
  store: ObjectStore,
  versionId: string,
  page: number,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'not_found' | 'unreadable'>> {
  signal.throwIfAborted()
  const version = await editableVersion(db, store, versionId, signal)
  if (!version.ok) return err(version.error === 'unreadable' ? 'unreadable' : 'not_found')
  if (version.value.contentType !== 'application/pdf') return err('not_found')
  const doc = openEditablePdf(version.value.bytes)
  if (doc === null) return err('unreadable')
  if (!Number.isInteger(page) || page < 1 || page > doc.countPages()) return err('not_found')
  const loaded = doc.loadPage(page - 1)
  const [x0, , x1] = loaded.getBounds()
  const scale = EDITOR_WIDTH / (x1 - x0)
  const pixmap = loaded.toPixmap(
    mupdf.Matrix.scale(scale, scale),
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
  )
  return ok(pixmap.asPNG())
}

function pdfSource(versionId: string, bytes: Uint8Array): PageGeometry[] | null {
  const doc = openEditablePdf(bytes)
  if (doc === null) return null
  return Array.from({ length: doc.countPages() }, (_, i) => {
    const [x0, y0, x1, y1] = doc.loadPage(i).getBounds()
    return { page: i + 1, src: editorPageUrl(versionId, i + 1), width: x1 - x0, height: y1 - y0 }
  })
}

async function imageSource(bytes: Uint8Array): Promise<PageGeometry[] | null> {
  try {
    const oriented = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true })
    const preview = await sharp(oriented.data)
      .resize({ width: EDITOR_WIDTH, withoutEnlargement: true })
      .png()
      .toBuffer()
    return [
      { page: 1, src: dataUrl(preview), width: oriented.info.width, height: oriented.info.height },
    ]
  } catch {
    return null
  }
}

export async function loadEditorSource(
  db: DbOrTx,
  store: ObjectStore,
  versionId: string,
  signal: AbortSignal,
): Promise<Result<EditorSource, SourceError>> {
  signal.throwIfAborted()
  const version = await editableVersion(db, store, versionId, signal)
  if (!version.ok) return err(version.error)
  const { documentId, title, contentType, bytes } = version.value
  const isPdf = contentType === 'application/pdf'
  if (!isPdf && contentType !== 'image/jpeg' && contentType !== 'image/png') {
    return err('unsupported')
  }
  const pages = isPdf ? pdfSource(versionId, bytes) : await imageSource(bytes)
  if (pages === null) return err('unreadable')
  return ok({ documentId, title, versionId, mode: isPdf ? 'pdf' : 'image', pages })
}
