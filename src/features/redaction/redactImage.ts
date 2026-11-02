import sharp from 'sharp'
import type { ImageBox } from '@/features/redaction/types'
import { err, ok, type Result } from '@/types/result'

const MAX_INPUT_PIXELS = 100_000_000

export async function redactImage(
  input: Uint8Array,
  contentType: 'image/jpeg' | 'image/png',
  boxes: ImageBox[],
): Promise<Result<{ bytes: Uint8Array }, 'decode_failed' | 'box_out_of_bounds'>> {
  try {
    const oriented = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .toBuffer({ resolveWithObject: true })
    const { width, height } = oriented.info
    const inside = boxes.every(
      (b) =>
        [b.x, b.y, b.width, b.height].every(Number.isInteger) &&
        b.width > 0 &&
        b.height > 0 &&
        b.x >= 0 &&
        b.y >= 0 &&
        b.x + b.width <= width &&
        b.y + b.height <= height,
    )
    if (!inside) return err('box_out_of_bounds')
    const black = await Promise.all(
      boxes.map(async (b) => ({
        input: await sharp({
          create: {
            width: b.width,
            height: b.height,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
          },
        })
          .png()
          .toBuffer(),
        left: b.x,
        top: b.y,
      })),
    )
    const composed = sharp(oriented.data).composite(black)
    const encoded = await (contentType === 'image/jpeg'
      ? composed.jpeg()
      : composed.png()
    ).toBuffer()
    return ok({ bytes: new Uint8Array(encoded) })
  } catch {
    return err('decode_failed')
  }
}
