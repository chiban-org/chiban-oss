import sharp from 'sharp'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { must } from '@/features/demo/seedPermitSupport'
import { attachDocument } from '@/features/documents/attach'
import type { DocKind } from '@/features/documents/types'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { renderPdf } from '@/features/pdf/renderPdf'
import type { ObjectStore } from '@/features/storage/objectStore'
import { addDays, type CivilDate } from '@/types/civilDate'

const PHOTO_SIZE = 96
export const TOWN = 'Town of Alder Pond'

export interface EnforcementSeedContext {
  db: Db
  store: ObjectStore
  signal: AbortSignal
  now: Date
  today: CivilDate
  day(offset: number): CivilDate
  staff: Actor
  admin: Actor
  finance: Actor
}

export function dayFrom(today: CivilDate) {
  return (offset: number): CivilDate => addDays(today, offset)
}

export async function photoBytes(shade: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: PHOTO_SIZE,
      height: PHOTO_SIZE,
      channels: 3,
      background: { r: 70 + shade, g: 110 + shade, b: 60 },
    },
  })
    .jpeg()
    .toBuffer()
  return new Uint8Array(buffer)
}

export async function caseDocument(
  ctx: EnforcementSeedContext,
  input: { caseId: string; title: string; docKind: DocKind },
): Promise<string> {
  const bytes = await renderPdf({
    title: input.title,
    townName: TOWN,
    scale: 'document',
    blocks: [
      {
        kind: 'paragraph',
        text: `${input.title}. Demonstration record for the Town of Alder Pond.`,
      },
    ],
  })
  return await ctx.db.transaction(async (tx) => {
    const stored = await storeGeneratedBytes(tx, ctx.store, bytes, 'application/pdf', ctx.signal)
    const attached = await attachDocument(
      tx,
      ctx.staff,
      {
        target: { kind: 'enforcement_case', id: input.caseId },
        title: input.title,
        docKind: input.docKind,
        file: {
          sha256: stored.sha256,
          filename: `${input.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.pdf`,
          contentType: 'application/pdf',
        },
      },
      ctx.signal,
    )
    return attached.documentId
  })
}

export { must }
