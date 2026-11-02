import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { DocKind, RecordRef } from '@/features/documents/types'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import type { AllowedType } from '@/features/files/sniff'
import type { ObjectStore } from '@/features/storage/objectStore'

const signal = new AbortController().signal

export function pdfBytes(marker: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(`%PDF-1.4\n% ${marker}\n`))
}

export interface UploadOptions {
  title?: string
  filename?: string
  contentType?: AllowedType
  now?: Date
  seriesKey?: string
  docKind?: DocKind
  isPublic?: boolean
}

export async function uploadAs(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  target: RecordRef,
  bytes: Uint8Array<ArrayBuffer>,
  options: UploadOptions = {},
): Promise<{ documentId: string; versionId: string; intentId: string }> {
  const contentType = options.contentType ?? 'application/pdf'
  const intent = await createUploadIntent(
    db,
    store,
    actor,
    {
      target,
      title: options.title ?? 'Site plan',
      filename: options.filename ?? 'site-plan.pdf',
      contentType,
      sizeBytes: bytes.length,
      ...(options.seriesKey === undefined ? {} : { seriesKey: options.seriesKey }),
      ...(options.docKind === undefined ? {} : { docKind: options.docKind }),
    },
    signal,
  )
  if (!intent.ok) throw new AppError(ErrorIds.DB_INVARIANT, `intent: ${intent.error}`)
  const put = await fetch(intent.value.url, {
    method: 'PUT',
    headers: intent.value.headers,
    body: new Blob([bytes]),
  })
  if (!put.ok) throw new AppError(ErrorIds.DB_INVARIANT, `put: ${put.status}`)
  const done = await finalizeUpload(
    db,
    store,
    actor,
    {
      intentId: intent.value.intentId,
      ...(options.isPublic === undefined ? {} : { isPublic: options.isPublic }),
    },
    signal,
    options.now,
  )
  if (!done.ok) throw new AppError(ErrorIds.DB_INVARIANT, `finalize: ${done.error}`)
  return { ...done.value, intentId: intent.value.intentId }
}
