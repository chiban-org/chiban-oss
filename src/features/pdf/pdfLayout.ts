import { type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import { toWinAnsi } from '@/features/pdf/winAnsi'

export const PAGE_WIDTH = 612
export const PAGE_HEIGHT = 792
export const MARGIN = 54
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
export const FOOTER_RESERVE = 36

export const INK = rgb(0.1, 0.1, 0.12)
export const MUTED = rgb(0.38, 0.38, 0.42)
export const RULE = rgb(0.75, 0.75, 0.78)

export function wrapLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const safe = toWinAnsi(text)
  const lines: string[] = []
  let line = ''
  const flush = () => {
    if (line !== '') lines.push(line)
    line = ''
  }
  for (const word of safe.split(' ')) {
    let rest = word
    while (font.widthOfTextAtSize(rest, size) > width) {
      let cut = rest.length - 1
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1
      flush()
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    const candidate = line === '' ? rest : `${line} ${rest}`
    if (font.widthOfTextAtSize(candidate, size) > width) {
      flush()
      line = rest
    } else {
      line = candidate
    }
  }
  flush()
  return lines.length === 0 ? [''] : lines
}

export function drawText(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
): void {
  page.drawText(toWinAnsi(text), {
    x: options.x,
    y: options.y,
    font: options.font,
    size: options.size,
    color: options.color ?? INK,
  })
}
