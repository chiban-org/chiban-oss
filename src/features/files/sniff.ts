export const ALLOWED_UPLOAD_TYPES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
} as const

export type AllowedType = keyof typeof ALLOWED_UPLOAD_TYPES

export const SNIFF_BYTES = 8

export function isAllowedType(value: string): value is AllowedType {
  return Object.hasOwn(ALLOWED_UPLOAD_TYPES, value)
}

export function sniffMatches(contentType: AllowedType, firstBytes: Uint8Array): boolean {
  const signature: readonly number[] = ALLOWED_UPLOAD_TYPES[contentType]
  if (firstBytes.length < signature.length) return false
  return signature.every((byte, i) => firstBytes[i] === byte)
}
