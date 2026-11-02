import { toWinAnsi } from '@/features/pdf/winAnsi'

const MAX_LINES = 4
const NEWLINES = /\r?\n/
const COMMA = /,\s*/

export function labelLines(name: string, address: string): string[] {
  const addressLines = (
    NEWLINES.test(address.trim()) ? address.split(NEWLINES) : address.split(COMMA)
  )
    .map((l) => toWinAnsi(l).trim())
    .filter((l) => l !== '')
  const lines = [toWinAnsi(name).trim(), ...addressLines]
  if (lines.length <= MAX_LINES) return lines
  return [...lines.slice(0, MAX_LINES - 1), lines.slice(MAX_LINES - 1).join(' ')]
}
