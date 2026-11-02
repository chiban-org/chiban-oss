import { err, ok, type Result } from '@/types/result'

export interface IdFormat {
  key: string
  kind: 'digits' | 'free_text'
  width: number | null
}

export function normalizeId(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function checkIdFormat(
  format: IdFormat,
  value: string,
): Result<string, 'id_format_mismatch'> {
  if (value.length === 0) return err('id_format_mismatch')
  if (format.kind === 'digits') {
    if (!/^\d+$/.test(value)) return err('id_format_mismatch')
    if (format.width !== null && value.length !== format.width) return err('id_format_mismatch')
  }
  return ok(value)
}
