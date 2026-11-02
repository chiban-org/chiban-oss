const FALLBACK = '/portal'
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export function safeNext(raw: string | null): string {
  if (raw === null || !raw.startsWith('/')) return FALLBACK
  if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK
  if (CONTROL_CHARACTERS.test(raw)) return FALLBACK
  return raw
}
