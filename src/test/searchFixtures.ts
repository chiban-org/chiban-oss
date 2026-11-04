import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { setPublic, uploadRedactedCopy } from '@/features/documents/publish'
import type { RecordRef } from '@/features/documents/types'
import { createUploadIntent } from '@/features/documents/uploads'
import { plainFrame } from '@/features/pdf/frame'
import { renderPdf } from '@/features/pdf/renderPdf'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { approveRendition } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { uploadAs } from '@/test/documentFixtures'

const signal = new AbortController().signal

export const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})

export async function textPdf(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await renderPdf({
    title: 'Record',
    frame: plainFrame('Town of Alder Pond'),
    scale: 'document',
    blocks: [{ kind: 'paragraph', text }],
  })
  return new Uint8Array(bytes)
}

export interface SeededText {
  documentId: string
  versionId: string
}

export async function uploadText(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  target: RecordRef,
  text: string,
  options: { title: string; seriesKey?: string; publish?: Actor },
): Promise<SeededText> {
  const up = await uploadAs(db, store, actor, target, await textPdf(text), {
    title: options.title,
    ...(options.seriesKey === undefined ? {} : { seriesKey: options.seriesKey }),
  })
  if (options.publish !== undefined) {
    await indexText(db, store)
    const approved = await approveRendition(
      db,
      options.publish,
      {
        versionId: up.versionId,
        purpose: 'public',
        reviewStatement: 'Fixture approval of the original.',
      },
      signal,
    )
    if (!approved.ok) throw new AppError(ErrorIds.DB_INVARIANT, `approve ${approved.error}`)
    await setPublic(db, options.publish, { documentId: up.documentId, isPublic: true }, signal)
  }
  return { documentId: up.documentId, versionId: up.versionId }
}

export async function addRedactedCopy(
  db: Db,
  store: ObjectStore,
  staff: Actor,
  target: RecordRef,
  documentId: string,
  text: string,
): Promise<void> {
  const bytes = await textPdf(text)
  const intent = await createUploadIntent(
    db,
    store,
    staff,
    {
      target,
      title: 'redacted',
      filename: 'redacted.pdf',
      contentType: 'application/pdf',
      sizeBytes: bytes.length,
      ...(target.kind === 'parcel' ? { seriesKey: 'nh.rs.blueprints_architectural' } : {}),
    },
    signal,
  )
  if (!intent.ok) throw new AppError(ErrorIds.DB_INVARIANT, `intent ${intent.error}`)
  await fetch(intent.value.url, {
    method: 'PUT',
    headers: intent.value.headers,
    body: new Blob([bytes]),
  })
  const done = await uploadRedactedCopy(
    db,
    store,
    staff,
    { documentId, intentId: intent.value.intentId },
    signal,
  )
  if (!done.ok) throw new AppError(ErrorIds.DB_INVARIANT, `redacted ${done.error}`)
  const approved = await approveRendition(
    db,
    staff,
    {
      versionId: done.value.versionId,
      purpose: 'public',
      reviewStatement: 'Fixture approval of the redacted copy.',
    },
    signal,
  )
  if (!approved.ok) throw new AppError(ErrorIds.DB_INVARIANT, `approve ${approved.error}`)
}

export async function indexText(db: Db, store: ObjectStore): Promise<void> {
  await processPreservation(db, store, converter, signal, 200)
}
