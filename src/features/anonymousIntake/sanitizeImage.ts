import sharp from 'sharp'
import { sniffMatches } from '@/features/files/sniff'
import { err, ok, type Result } from '@/types/result'

export type SanitizedType = 'image/jpeg' | 'image/png'

const MAX_INPUT_PIXELS = 40_000_000
const SNIFF_LENGTH = 8
const PIXEL_LIMIT_MESSAGE = 'pixel limit'

export async function sanitizeImage(
  bytes: Uint8Array,
  declared: SanitizedType,
): Promise<
  Result<
    { bytes: Uint8Array; contentType: SanitizedType },
    'type_mismatch' | 'decode_failed' | 'too_large'
  >
> {
  if (!sniffMatches(declared, bytes.subarray(0, SNIFF_LENGTH))) return err('type_mismatch')
  try {
    const pipeline = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate()
    const encoded = await (declared === 'image/jpeg' ? pipeline.jpeg() : pipeline.png()).toBuffer()
    return ok({ bytes: new Uint8Array(encoded), contentType: declared })
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    return err(message.includes(PIXEL_LIMIT_MESSAGE) ? 'too_large' : 'decode_failed')
  }
}
