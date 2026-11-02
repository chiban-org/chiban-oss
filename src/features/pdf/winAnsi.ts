const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
}

const UNDEFINED_BYTES = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d])
const FIRST_PRINTABLE = 0x20
const LAST_BYTE = 0xff

function buildEncodable(): ReadonlySet<string> {
  const decoder = new TextDecoder('windows-1252')
  const chars = new Set<string>()
  for (let byte = FIRST_PRINTABLE; byte <= LAST_BYTE; byte += 1) {
    if (byte === 0x7f || UNDEFINED_BYTES.has(byte)) continue
    chars.add(decoder.decode(Uint8Array.of(byte)))
  }
  return chars
}

const ENCODABLE = buildEncodable()

function convertCharacter(char: string): string {
  if (ENCODABLE.has(char)) return char
  const mapped = TRANSLITERATIONS[char]
  if (mapped !== undefined) return mapped
  const base = char.normalize('NFKD').replace(/\p{M}/gu, '')
  return base !== '' && [...base].every((c) => ENCODABLE.has(c)) ? base : '?'
}

export function toWinAnsi(text: string): string {
  return [...text.replace(/[\r\n\t]+/g, ' ')].map(convertCharacter).join('')
}
