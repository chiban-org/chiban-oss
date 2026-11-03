const LEADING_PUNCTUATION = /^[\s.:;,]+/

export function gateDetail(label: string, reason: string): string {
  if (!reason.startsWith(label)) return reason
  return reason.slice(label.length).replace(LEADING_PUNCTUATION, '')
}
