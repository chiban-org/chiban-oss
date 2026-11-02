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

const TIFF_SIGNATURES = [
  [0x49, 0x49, 0x2a, 0x00],
  [0x4d, 0x4d, 0x00, 0x2a],
] as const

export type SignatureTable = Readonly<
  Record<string, readonly number[] | readonly (readonly number[])[]>
>

export const MIGRATION_ORIGINAL_TYPES = {
  ...ALLOWED_UPLOAD_TYPES,
  'image/tiff': TIFF_SIGNATURES,
} as const satisfies SignatureTable

function signaturesOf(entry: readonly number[] | readonly (readonly number[])[]) {
  return typeof entry[0] === 'number'
    ? [entry as readonly number[]]
    : (entry as readonly (readonly number[])[])
}

export function matchContentType(table: SignatureTable, head: Uint8Array): string | null {
  for (const [type, entry] of Object.entries(table)) {
    const matched = signaturesOf(entry).some(
      (signature) =>
        head.length >= signature.length && signature.every((byte, i) => head[i] === byte),
    )
    if (matched) return type
  }
  return null
}
