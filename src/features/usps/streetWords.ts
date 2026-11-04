const BOX_PREFIXES = ['POBOX', 'POSTOFFICEBOX', 'RR', 'HC']

const STREET_WORDS = new Set(
  'ALY ALLEY AVE AVENUE BLVD BOULEVARD BND BEND BRG BRIDGE CIR CIRCLE CT COURT CV COVE CRES CRESCENT DR DRIVE EXT EXTENSION HL HILL HOLW HOLLOW HWY HIGHWAY LN LANE LOOP PATH PIKE PKWY PARKWAY PL PLACE PLZ PLAZA RD ROAD RDG RIDGE ROW RUN SQ SQUARE ST STREET TER TERRACE TPKE TURNPIKE TRL TRAIL WAY XING CROSSING'.split(
    ' ',
  ),
)

const UNIT_WORDS = new Set(['APT', 'STE', 'SUITE', 'UNIT', 'FL', 'FLOOR', 'RM', 'ROOM', 'LOT', '#'])

function upper(word: string): string {
  return word.toUpperCase().replace(/\.$/, '')
}

function isHouseNumber(word: string): boolean {
  return /^\d+[A-Z]?$/i.test(word) || /^\d+-\d+[A-Z]?$/i.test(word)
}

function isBox(text: string): boolean {
  const squeezed = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return BOX_PREFIXES.some((prefix) => squeezed.startsWith(prefix) && /\d/.test(squeezed))
}

export function startsLikeStreet(text: string): boolean {
  return isHouseNumber(text.split(' ')[0] ?? '') || isBox(text)
}

function boxEnd(words: readonly string[]): number {
  const number = words.findIndex((word, index) => index > 0 && /\d/.test(word))
  return number < 0 ? words.length : number + 1
}

function streetWordEnd(words: readonly string[]): number {
  const named = words.findIndex((word, index) => index >= 2 && STREET_WORDS.has(upper(word)))
  const found =
    named >= 0 ? named : words.findIndex((w, i) => i === 1 && STREET_WORDS.has(upper(w)))
  if (found < 0) return words.length
  let end = found + 1
  while (end < words.length && STREET_WORDS.has(upper(words.at(end) ?? ''))) end += 1
  if (UNIT_WORDS.has(upper(words.at(end) ?? '')) && end + 1 < words.length) end += 2
  return end
}

export function splitStreetAndCity(text: string): { street: string; city: string } {
  const words = text.split(' ')
  const end = isBox(text) ? boxEnd(words) : streetWordEnd(words)
  return { street: words.slice(0, end).join(' '), city: words.slice(end).join(' ') }
}
