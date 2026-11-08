const CRLF = '\r\n'

export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function toCsvRows(rows: string[][]): string {
  return `${rows.map((r) => r.map(csvField).join(',')).join(CRLF)}${CRLF}`
}

export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
