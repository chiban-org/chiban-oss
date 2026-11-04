import { PDFDocument } from 'pdf-lib'
import { sha256Hex } from '@/features/files/ingest'
import { sniffMatches } from '@/features/files/sniff'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  TOWN_ASSET_PREFIX,
  TOWN_IMAGE_TYPES,
  type TownImage,
  type TownImageType,
} from '@/features/town/profileSchema'
import { err, ok, type Result } from '@/types/result'

export const TOWN_IMAGE_MAX_BYTES = 2 * 1024 * 1024

export type TownImageError = 'too_large' | 'wrong_type' | 'unreadable'

const SHA256 = /^[0-9a-f]{64}$/

function sniffType(bytes: Uint8Array): TownImageType | null {
  return TOWN_IMAGE_TYPES.find((type) => sniffMatches(type, bytes.subarray(0, 8))) ?? null
}

async function measure(
  bytes: Uint8Array,
  type: TownImageType,
): Promise<{ width: number; height: number } | null> {
  try {
    const doc = await PDFDocument.create()
    const image = type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    return image.width > 0 && image.height > 0 ? { width: image.width, height: image.height } : null
  } catch {
    return null
  }
}

export async function storeTownImage(
  store: ObjectStore,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<Result<TownImage, TownImageError>> {
  signal.throwIfAborted()
  if (bytes.length > TOWN_IMAGE_MAX_BYTES) return err('too_large')
  const contentType = sniffType(bytes)
  if (contentType === null) return err('wrong_type')
  const size = await measure(bytes, contentType)
  if (size === null) return err('unreadable')
  const objectKey = `${TOWN_ASSET_PREFIX}${sha256Hex(bytes)}`
  await store.putBytes(objectKey, bytes, contentType, signal)
  return ok({ objectKey, contentType, ...size })
}

export async function readTownImage(
  store: ObjectStore,
  sha256: string,
  signal: AbortSignal,
): Promise<Result<{ bytes: Uint8Array; contentType: TownImageType }, 'not_found'>> {
  if (!SHA256.test(sha256)) return err('not_found')
  const stream = await store.getStream(`${TOWN_ASSET_PREFIX}${sha256}`, signal)
  if (!stream.ok) return err('not_found')
  const bytes = new Uint8Array(await new Response(stream.value).arrayBuffer())
  const contentType = sniffType(bytes)
  return contentType === null ? err('not_found') : ok({ bytes, contentType })
}
