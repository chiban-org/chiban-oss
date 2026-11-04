export interface UspsQuery {
  streetAddress: string
  secondaryAddress?: string
  city?: string
  state?: string
  ZIPCode?: string
  ZIPPlus4?: string
}

export interface TypedAddress {
  preamble: string[]
  query: UspsQuery
}

const USPS_STATE_CODES = new Set(
  'AA AE AL AK AP AS AZ AR CA CO CT DE DC FM FL GA GU HI ID IL IN IA KS KY LA ME MH MD MA MI MN MS MO MP MT NE NV NH NJ NM NY NC ND OH OK OR PW PA PR RI SC SD TN TX UT VT VI VA WA WV WI WY'.split(
    ' ',
  ),
)

function readZip(word: string): { ZIPCode: string; ZIPPlus4?: string } | null {
  const digits = word.replace('-', '')
  const hyphen = word.indexOf('-')
  if (!/^\d+$/.test(digits) || (hyphen >= 0 && hyphen !== 5)) return null
  if (digits.length === 5 && !word.includes('-')) return { ZIPCode: digits }
  if (digits.length === 9) return { ZIPCode: digits.slice(0, 5), ZIPPlus4: digits.slice(5) }
  return null
}
const BOX_PREFIXES = ['POBOX', 'POSTOFFICEBOX', 'RR', 'HC']

function startsLikeStreet(text: string): boolean {
  if (/^\d/.test(text)) return true
  const squeezed = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return BOX_PREFIXES.some((prefix) => squeezed.startsWith(prefix) && /\d/.test(squeezed))
}

interface Segment {
  line: number
  text: string
}

interface LastLine {
  city?: string
  state?: string
  ZIPCode?: string
  ZIPPlus4?: string
}

function segmentsOf(lines: readonly string[]): Segment[] {
  return lines.flatMap((raw, line) =>
    raw
      .split(',')
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter((text) => text !== '')
      .map((text) => ({ line, text })),
  )
}

function readLastLine(text: string): LastLine | null {
  const words = text.split(' ')
  const found: LastLine = {}
  const zip = readZip(words.at(-1) ?? '')
  if (zip !== null) {
    words.pop()
    Object.assign(found, zip)
  }
  const state = (words.at(-1) ?? '').replace(/\./g, '').toUpperCase()
  if (USPS_STATE_CODES.has(state)) {
    words.pop()
    found.state = state
  }
  if (found.ZIPCode === undefined && found.state === undefined) return null
  if (words.length > 0) found.city = words.join(' ')
  return found
}

function preambleOf(segments: Segment[], streetIndex: number): string[] {
  const before = segments.slice(0, streetIndex)
  const streetLine = segments.at(streetIndex)?.line ?? 0
  const wholeLines = [...new Set(before.filter((s) => s.line < streetLine).map((s) => s.line))]
  const preamble = wholeLines.map((line) =>
    before
      .filter((s) => s.line === line)
      .map((s) => s.text)
      .join(', '),
  )
  const sameLine = before.filter((s) => s.line === streetLine).map((s) => s.text)
  return sameLine.length === 0 ? preamble : [...preamble, sameLine.join(', ')]
}

function resolveCity(last: LastLine, between: Segment[]): { last: LastLine; between: Segment[] } {
  if (last.city !== undefined || last.state === undefined || between.length === 0) {
    return { last, between }
  }
  return { last: { ...last, city: between.at(-1)?.text ?? '' }, between: between.slice(0, -1) }
}

function isUsable(last: LastLine): boolean {
  return last.ZIPCode !== undefined || (last.city !== undefined && last.state !== undefined)
}

export function parseTypedAddress(lines: readonly string[]): TypedAddress | null {
  const segments = segmentsOf(lines)
  const lastSegment = segments.at(-1)
  if (lastSegment === undefined) return null
  const parsedLast = readLastLine(lastSegment.text)
  if (parsedLast === null) return null
  const streetIndex = segments.findIndex((s) => startsLikeStreet(s.text))
  if (streetIndex < 0 || streetIndex >= segments.length - 1) return null
  const resolved = resolveCity(parsedLast, segments.slice(streetIndex + 1, -1))
  if (!isUsable(resolved.last)) return null
  const secondary = resolved.between.map((s) => s.text).join(' ')
  const query: UspsQuery = {
    streetAddress: segments.at(streetIndex)?.text ?? '',
    ...(secondary === '' ? {} : { secondaryAddress: secondary }),
    ...resolved.last,
  }
  return { preamble: preambleOf(segments, streetIndex), query }
}
