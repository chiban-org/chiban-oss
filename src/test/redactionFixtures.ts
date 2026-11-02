import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { ObjectStore } from '@/features/storage/objectStore'
import { uploadAs } from '@/test/documentFixtures'
import { makeParcel } from '@/test/parcels'

export const FIXTURE_PHONE = '603-555-0147'
export const LETTER_PHONE_BOX = { page: 1, x0: 60, y0: 70, x1: 320, y1: 100 }
export const PHOTO_BOX = { x: 40, y: 30, width: 100, height: 60 }

export function redactionFixture(name: string): Uint8Array<ArrayBuffer> {
  const bytes = readFileSync(
    fileURLToPath(new URL(`./fixtures/redaction/${name}`, import.meta.url)),
  )
  return new Uint8Array(bytes)
}

export async function uploadRedactionFixture(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  name: 'letter.pdf' | 'site-photo.jpg' | 'scanned-with-ocr.pdf',
  parcelId?: string,
): Promise<{ documentId: string; versionId: string; parcelId: string }> {
  const parcel = parcelId ?? (await makeParcel(db, []))
  const isPhoto = name.endsWith('.jpg')
  const uploaded = await uploadAs(
    db,
    store,
    actor,
    { kind: 'parcel', id: parcel },
    redactionFixture(name),
    {
      title: name,
      filename: name,
      contentType: isPhoto ? 'image/jpeg' : 'application/pdf',
      seriesKey: 'nh.rs.correspondence_administrative',
    },
  )
  return { documentId: uploaded.documentId, versionId: uploaded.versionId, parcelId: parcel }
}
