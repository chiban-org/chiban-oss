import { type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import { splitToWidth } from '@/features/pdf/fitWidth'
import { printable } from '@/features/pdf/pdfFonts'

export const PAGE_WIDTH = 612
export const PAGE_HEIGHT = 792
export const MARGIN = 54
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
export const FOOTER_RESERVE = 36
export const LEADING = 1.3

export const INK = rgb(0.1, 0.1, 0.12)
export const MUTED = rgb(0.36, 0.39, 0.44)
export const RULE = rgb(0.75, 0.75, 0.78)

export function wrapLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const safe = printable(font, text)
  const lines: string[] = []
  let line = ''
  const flush = () => {
    if (line !== '') lines.push(line)
    line = ''
  }
  for (const word of safe.split(' ')) {
    const parts = splitToWidth(font, word, size, width)
    const rest = parts.pop() ?? ''
    for (const part of parts) {
      flush()
      lines.push(part)
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

export function textWidth(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(printable(font, text), size)
}

export function drawText(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
): void {
  page.drawText(printable(options.font, text), {
    x: options.x,
    y: options.y,
    font: options.font,
    size: options.size,
    color: options.color ?? INK,
  })
}

export function drawRule(page: PDFPage, y: number, from = MARGIN, to = PAGE_WIDTH - MARGIN): void {
  page.drawLine({ start: { x: from, y }, end: { x: to, y }, color: RULE, thickness: 0.75 })
}
