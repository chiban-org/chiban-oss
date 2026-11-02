import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { redactImage } from '@/features/redaction/redactImage'

const photo = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL('../../test/fixtures/redaction/site-photo.jpg', import.meta.url)),
  ),
)
const BOX = { x: 40, y: 30, width: 100, height: 60 }

function soiCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString('latin1')
  return text.split('\xff\xd8\xff').length - 1
}

describe('redactImage', () => {
  it('the fixture carries exif, gps, and an embedded thumbnail', async () => {
    const meta = await sharp(photo).metadata()
    expect(meta.exif).toBeDefined()
    expect(soiCount(photo)).toBeGreaterThanOrEqual(2)
  })

  it('redacted jpeg has a black box and no exif or thumbnail', async () => {
    const result = await redactImage(photo, 'image/jpeg', [BOX])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const meta = await sharp(result.value.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(soiCount(result.value.bytes)).toBe(1)
    expect(Buffer.from(result.value.bytes).toString('latin1')).not.toContain('Exif')
    const { data, info } = await sharp(result.value.bytes)
      .extract({ left: 45, top: 35, width: 90, height: 50 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(info.channels).toBeGreaterThanOrEqual(3)
    expect(Math.max(...data)).toBeLessThan(16)
    const outside = await sharp(result.value.bytes)
      .extract({ left: 200, top: 150, width: 20, height: 20 })
      .raw()
      .toBuffer()
    expect(Math.max(...outside)).toBeGreaterThan(100)
  })

  it('a png is redacted and keeps its type', async () => {
    const png = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 250, g: 250, b: 250 } },
    })
      .png()
      .toBuffer()
    const result = await redactImage(new Uint8Array(png), 'image/png', [
      { x: 10, y: 10, width: 30, height: 20 },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const meta = await sharp(result.value.bytes).metadata()
    expect(meta.format).toBe('png')
    const { data } = await sharp(result.value.bytes)
      .extract({ left: 12, top: 12, width: 20, height: 10 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(Math.max(...data)).toBeLessThan(16)
  })

  it('a box past the image edge is box_out_of_bounds', async () => {
    expect(
      await redactImage(photo, 'image/jpeg', [{ x: 300, y: 10, width: 100, height: 20 }]),
    ).toEqual({
      ok: false,
      error: 'box_out_of_bounds',
    })
  })

  it('bytes that are not an image are decode_failed', async () => {
    expect(
      await redactImage(new TextEncoder().encode('not an image'), 'image/jpeg', [BOX]),
    ).toEqual({ ok: false, error: 'decode_failed' })
  })
})
