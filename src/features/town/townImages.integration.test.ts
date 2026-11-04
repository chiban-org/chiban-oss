import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ObjectStore } from '@/features/storage/objectStore'
import { readTownImage, storeTownImage, TOWN_IMAGE_MAX_BYTES } from '@/features/town/townImages'
import { pngBytes } from '@/test/frameFixtures'
import { makeTestStore } from '@/test/minio'

const signal = new AbortController().signal
let store: ObjectStore

beforeAll(async () => {
  store = (await makeTestStore()).store
})

describe('town images', () => {
  it('stores a PNG under the town asset area with its size', async () => {
    const result = await storeTownImage(store, await pngBytes(64, 32), signal)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.objectKey).toMatch(/^town-assets\/[0-9a-f]{64}$/)
    expect(result.value).toMatchObject({ contentType: 'image/png', width: 64, height: 32 })
    const read = await readTownImage(store, result.value.objectKey.slice(12), signal)
    expect(read.ok && read.value.contentType).toBe('image/png')
  })

  it('stores a JPEG', async () => {
    const jpeg = await sharp({
      create: { width: 30, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    const result = await storeTownImage(store, new Uint8Array(jpeg), signal)
    expect(result.ok && result.value).toMatchObject({ contentType: 'image/jpeg', width: 30 })
  })

  it('refuses a file that is not a PNG or JPEG whatever it is called', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7 not an image')
    expect(await storeTownImage(store, pdf, signal)).toEqual({ ok: false, error: 'wrong_type' })
  })

  it('refuses a file larger than 2 MB', async () => {
    const big = new Uint8Array(TOWN_IMAGE_MAX_BYTES + 1)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(await storeTownImage(store, big, signal)).toEqual({ ok: false, error: 'too_large' })
  })

  it('refuses a damaged PNG', async () => {
    const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    expect(await storeTownImage(store, broken, signal)).toEqual({ ok: false, error: 'unreadable' })
  })

  it('reads back only well-formed keys that exist', async () => {
    expect(await readTownImage(store, 'not-a-hash', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await readTownImage(store, 'e'.repeat(64), signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
