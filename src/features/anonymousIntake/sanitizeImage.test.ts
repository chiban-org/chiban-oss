import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { sanitizeImage } from '@/features/anonymousIntake/sanitizeImage'

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../test/fixtures/anonymous/${name}`, import.meta.url))),
  )

function contains(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(text, 'latin1'))
}

describe('sanitizeImage', () => {
  it('the fixtures really carry the metadata the sanitizer must remove', async () => {
    const meta = await sharp(fixture('gps-artist.jpg')).metadata()
    expect(meta.exif).toBeDefined()
    expect(meta.xmp).toBeDefined()
    expect(meta.icc).toBeDefined()
    expect(contains(fixture('text-chunk.png'), 'probe-png-author')).toBe(true)
  })

  it('jpeg with gps and artist comes out with no exif, xmp, or icc', async () => {
    const result = await sanitizeImage(fixture('gps-artist.jpg'), 'image/jpeg')
    if (!result.ok) throw new Error(result.error)
    const meta = await sharp(result.value.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(meta.format).toBe('jpeg')
    expect(result.value.contentType).toBe('image/jpeg')
    for (const marker of ['probe-exif-artist', 'ProbeCam', 'probe-xmp-creator']) {
      expect(contains(result.value.bytes, marker)).toBe(false)
    }
  })

  it('png text chunk is gone', async () => {
    const result = await sanitizeImage(fixture('text-chunk.png'), 'image/png')
    if (!result.ok) throw new Error(result.error)
    expect(contains(result.value.bytes, 'probe-png-author')).toBe(false)
    expect(contains(result.value.bytes, 'probe-png-comment')).toBe(false)
    expect(contains(result.value.bytes, 'tEXt')).toBe(false)
    expect(contains(result.value.bytes, 'iTXt')).toBe(false)
    expect((await sharp(result.value.bytes).metadata()).format).toBe('png')
  })

  it('pdf is type_mismatch', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\n% probe\n')
    expect(await sanitizeImage(pdf, 'image/jpeg')).toEqual({ ok: false, error: 'type_mismatch' })
  })

  it('a png declared as jpeg is type_mismatch', async () => {
    expect(await sanitizeImage(fixture('text-chunk.png'), 'image/jpeg')).toEqual({
      ok: false,
      error: 'type_mismatch',
    })
  })

  it('a truncated jpeg is decode_failed', async () => {
    const broken = fixture('gps-artist.jpg').slice(0, 40)
    expect(await sanitizeImage(broken, 'image/jpeg')).toEqual({ ok: false, error: 'decode_failed' })
  })

  it('an image over the pixel limit is too_large', async () => {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(10_000, 0)
    ihdr.writeUInt32BE(10_000, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    const chunk = (type: string, data: Buffer) => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(data.length)
      const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(crc32(body) >>> 0)
      return Buffer.concat([length, body, crc])
    }
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.alloc(1))),
      chunk('IEND', Buffer.alloc(0)),
    ])
    expect(await sanitizeImage(new Uint8Array(png), 'image/png')).toEqual({
      ok: false,
      error: 'too_large',
    })
  })

  it('an exif orientation is applied before the metadata is dropped', async () => {
    const rotated = await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const result = await sanitizeImage(new Uint8Array(rotated), 'image/jpeg')
    if (!result.ok) throw new Error(result.error)
    const meta = await sharp(result.value.bytes).metadata()
    expect([meta.width, meta.height]).toEqual([20, 40])
    expect(meta.orientation).toBeUndefined()
  })
})
