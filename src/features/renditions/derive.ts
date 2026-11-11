import { and, eq } from 'drizzle-orm'
import * as mupdf from 'mupdf'
import sharp from 'sharp'
import type { DbOrTx } from '@/db/client'
import { documentRenditions, documentVersions, files, type RenditionKind } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { resolveRendition } from '@/features/documents/visibility'
import { openPdf } from '@/features/redaction/verifyRedaction'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export const THUMBNAIL_WIDTH = 240
export const PREVIEW_WIDTH = 1200
export const MAX_PREVIEW_PAGES = 50
export const MAX_RENDER_PIXELS = 8_000_000
export const MAX_INPUT_PIXELS = 40_000_000
const PIXEL_ROUNDING_MARGIN = 0.99
const PNG = 'image/png'

export function derivedKey(versionId: string, kind: RenditionKind, page: number): string {
  return `derived/${versionId}/${kind}-p${page}.png`
}

interface Rendered {
  kind: RenditionKind
  page: number
  width: number
  bytes: Uint8Array
}

function boundedScale(width: number, pageWidth: number, pageHeight: number): number | null {
  if (!(pageWidth > 0 && pageHeight > 0)) return null
  const wanted = width / pageWidth
  const largest = Math.sqrt(MAX_RENDER_PIXELS / (pageWidth * pageHeight)) * PIXEL_ROUNDING_MARGIN
  return Math.min(wanted, largest)
}

export function renderPdfPages(bytes: Uint8Array): Rendered[] | null {
  try {
    return renderOpenedPdf(bytes)
  } catch {
    return null
  }
}

function renderOpenedPdf(bytes: Uint8Array): Rendered[] | null {
  const doc = openPdf(bytes)
  if (doc === null || doc.needsPassword()) return null
  const rendered: Rendered[] = []
  const pages = Math.min(doc.countPages(), MAX_PREVIEW_PAGES)
  for (let i = 0; i < pages; i += 1) {
    const page = doc.loadPage(i)
    const [x0, y0, x1, y1] = page.getBounds()
    const targets: [RenditionKind, number][] =
      i === 0
        ? [
            ['thumbnail', THUMBNAIL_WIDTH],
            ['preview', PREVIEW_WIDTH],
          ]
        : [['preview', PREVIEW_WIDTH]]
    for (const [kind, width] of targets) {
      const scale = boundedScale(width, x1 - x0, y1 - y0)
      if (scale === null) return null
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      )
      rendered.push({ kind, page: i + 1, width: pixmap.getWidth(), bytes: pixmap.asPNG() })
    }
  }
  return rendered
}

export async function renderImage(bytes: Uint8Array): Promise<Rendered[] | null> {
  try {
    const out: Rendered[] = []
    for (const [kind, width] of [
      ['thumbnail', THUMBNAIL_WIDTH],
      ['preview', PREVIEW_WIDTH],
    ] as const) {
      const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true })
      out.push({ kind, page: 1, width: info.width, bytes: new Uint8Array(data) })
    }
    return out
  } catch {
    return null
  }
}

async function readBytes(store: ObjectStore, key: string, signal: AbortSignal) {
  const stream = await store.getStream(key, signal)
  if (!stream.ok) return null
  return new Uint8Array(await new Response(stream.value).arrayBuffer())
}

export async function deriveRenditions(
  db: DbOrTx,
  store: ObjectStore,
  versionId: string,
  signal: AbortSignal,
): Promise<Result<{ pages: number }, 'not_found' | 'unsupported' | 'failed'>> {
  signal.throwIfAborted()
  const [version] = await db
    .select({ contentType: documentVersions.contentType, storageKey: files.storageKey })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.id, versionId))
  if (version === undefined) return err('not_found')
  const isPdf = version.contentType === 'application/pdf'
  const isImage = version.contentType === 'image/jpeg' || version.contentType === 'image/png'
  if (!isPdf && !isImage) return err('unsupported')
  const source = await readBytes(store, version.storageKey, signal)
  if (source === null) return err('failed')
  const rendered = isPdf ? renderPdfPages(source) : await renderImage(source)
  if (rendered === null || rendered.length === 0) return err('failed')
  for (const item of rendered) {
    const key = derivedKey(versionId, item.kind, item.page)
    await store.putBytes(key, item.bytes, PNG, signal)
    await db
      .insert(documentRenditions)
      .values({ versionId, kind: item.kind, page: item.page, storageKey: key, width: item.width })
      .onConflictDoNothing()
  }
  return ok({ pages: Math.max(...rendered.map((r) => r.page)) })
}

export async function serveDerivative(
  db: DbOrTx,
  store: ObjectStore,
  actor: Actor | null,
  input: { documentId: string; kind: RenditionKind; page: number },
  signal: AbortSignal,
): Promise<Result<{ bytes: Uint8Array; etag: string; versionId: string }, 'not_found'>> {
  signal.throwIfAborted()
  const resolved = await resolveRendition(db, actor, input.documentId, signal)
  if (!resolved.ok) return err('not_found')
  const versionId = resolved.value.versionId
  const find = async () => {
    const [row] = await db
      .select({ storageKey: documentRenditions.storageKey })
      .from(documentRenditions)
      .where(
        and(
          eq(documentRenditions.versionId, versionId),
          eq(documentRenditions.kind, input.kind),
          eq(documentRenditions.page, input.page),
        ),
      )
    return row
  }
  let row = await find()
  if (row === undefined) {
    const derived = await deriveRenditions(db, store, versionId, signal)
    if (!derived.ok) return err('not_found')
    row = await find()
  }
  if (row === undefined) return err('not_found')
  const bytes = await readBytes(store, row.storageKey, signal)
  if (bytes === null) return err('not_found')
  return ok({ bytes, etag: `"${versionId}-${input.kind}-${input.page}"`, versionId })
}
