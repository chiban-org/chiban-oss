import type { PDFFont } from 'pdf-lib'

function fittingPrefixLength(font: PDFFont, text: string, size: number, width: number): number {
  const fits = (length: number) => font.widthOfTextAtSize(text.slice(0, length), size) <= width
  let low = 1
  let high = 2
  while (high < text.length && fits(high)) {
    low = high
    high *= 2
  }
  if (high >= text.length) {
    if (fits(text.length)) return text.length
    high = text.length
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid
  }
  return low
}

export function splitToWidth(font: PDFFont, text: string, size: number, width: number): string[] {
  if (font.widthOfTextAtSize(text, size) <= width) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > 0) {
    const cut = fittingPrefixLength(font, rest, size, width)
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  return parts
}
