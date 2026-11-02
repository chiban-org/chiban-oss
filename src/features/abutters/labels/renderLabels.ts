import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'
import { type LabelSheet, labelOrigin } from '@/features/abutters/labels/labelSheets'
import { toWinAnsi } from '@/features/pdf/winAnsi'

const INSET_PT = 6
const FONT_SIZES = [10, 9, 8]
const LEADING_RATIO = 1.15
const ELLIPSIS = '...'

function fitLine(font: PDFFont, text: string, width: number): { text: string; size: number } {
  for (const size of FONT_SIZES) {
    if (font.widthOfTextAtSize(text, size) <= width) return { text, size }
  }
  const size = FONT_SIZES[FONT_SIZES.length - 1] as number
  let cut = text
  while (cut.length > 0 && font.widthOfTextAtSize(`${cut}${ELLIPSIS}`, size) > width) {
    cut = cut.slice(0, -1)
  }
  return { text: `${cut}${ELLIPSIS}`, size }
}

function drawLabel(
  page: PDFPage,
  font: PDFFont,
  sheet: LabelSheet,
  lines: string[],
  index: number,
) {
  const origin = labelOrigin(sheet, index)
  const width = sheet.labelWidthPt - INSET_PT * 2
  const topSize = FONT_SIZES[0] as number
  let y = sheet.pageHeightPt - origin.yFromTopPt - INSET_PT - topSize
  for (const line of lines) {
    const fitted = fitLine(font, toWinAnsi(line), width)
    page.drawText(fitted.text, {
      x: origin.xPt + INSET_PT,
      y,
      size: fitted.size,
      font,
      color: rgb(0, 0, 0),
    })
    y -= topSize * LEADING_RATIO
  }
}

export async function renderLabels(sheet: LabelSheet, labels: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const sorted = [...labels].sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
  const pages: PDFPage[] = []
  for (const [index, lines] of sorted.entries()) {
    const { page: pageIndex } = labelOrigin(sheet, index)
    while (pages.length <= pageIndex)
      pages.push(doc.addPage([sheet.pageWidthPt, sheet.pageHeightPt]))
    drawLabel(pages[pageIndex] as PDFPage, font, sheet, lines, index)
  }
  if (pages.length === 0) doc.addPage([sheet.pageWidthPt, sheet.pageHeightPt])
  return await doc.save()
}
