import { PDFDocument, type PDFFont, type PDFPage, StandardFonts } from 'pdf-lib'
import {
  CONTENT_WIDTH,
  drawText,
  FOOTER_RESERVE,
  INK,
  MARGIN,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  RULE,
  wrapLines,
} from '@/features/pdf/pdfLayout'

export type PdfBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'fields'; rows: { label: string; value: string }[] }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'signature'; label: string }
  | { kind: 'notice'; text: string }

export interface PdfDocumentSpec {
  title: string
  subtitle?: string
  townName: string
  blocks: PdfBlock[]
  scale: 'document' | 'placard'
}

interface Fonts {
  heading: PDFFont
  body: PDFFont
  bold: PDFFont
}

interface Sizes {
  title: number
  body: number
  value: number
  label: number
}

const SIZES: Record<PdfDocumentSpec['scale'], Sizes> = {
  document: { title: 22, body: 10.5, value: 10.5, label: 9 },
  placard: { title: 48, body: 16, value: 24, label: 12 },
}
const LEADING = 1.3
const LABEL_COLUMN = 130
const BLOCK_GAP = 12

class Page {
  private readonly pages: PDFPage[] = []
  private current: PDFPage
  y = 0

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.current = this.addPage()
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.pages.push(page)
    this.current = page
    this.y = PAGE_HEIGHT - MARGIN
    return page
  }

  get page(): PDFPage {
    return this.current
  }

  get all(): PDFPage[] {
    return this.pages
  }

  ensure(height: number, onNewPage?: () => void): void {
    if (this.y - height >= MARGIN + FOOTER_RESERVE) return
    this.addPage()
    onNewPage?.()
  }
}

function drawTitle(layout: Page, spec: PdfDocumentSpec, sizes: Sizes): void {
  const { fonts, page } = layout
  drawText(page, spec.townName.toUpperCase(), {
    x: MARGIN,
    y: layout.y - 10,
    font: fonts.body,
    size: 10,
    color: MUTED,
  })
  layout.y -= 28
  let size = sizes.title
  while (size > 12 && fonts.heading.widthOfTextAtSize(spec.title, size) > CONTENT_WIDTH) size -= 2
  const titleWidth = fonts.heading.widthOfTextAtSize(spec.title, size)
  const x = spec.scale === 'placard' ? (PAGE_WIDTH - titleWidth) / 2 : MARGIN
  drawText(page, spec.title, { x, y: layout.y - size, font: fonts.heading, size })
  layout.y -= size * LEADING + 4
  if (spec.subtitle !== undefined) {
    drawText(page, spec.subtitle, {
      x: MARGIN,
      y: layout.y - 12,
      font: fonts.body,
      size: 12,
      color: MUTED,
    })
    layout.y -= 22
  }
  page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN, y: layout.y },
    color: RULE,
    thickness: 1,
  })
  layout.y -= BLOCK_GAP
}

function drawLines(layout: Page, lines: string[], font: PDFFont, size: number, x: number): void {
  for (const line of lines) {
    layout.ensure(size * LEADING)
    layout.y -= size * LEADING
    drawText(layout.page, line, { x, y: layout.y + size * 0.25, font, size })
  }
}

function drawFields(layout: Page, rows: { label: string; value: string }[], sizes: Sizes): void {
  const labelWidth = sizes.label === SIZES.placard.label ? 150 : LABEL_COLUMN
  const valueWidth = CONTENT_WIDTH - labelWidth
  for (const row of rows) {
    const valueLines = wrapLines(row.value, layout.fonts.body, sizes.value, valueWidth)
    layout.ensure(valueLines.length * sizes.value * LEADING)
    const top = layout.y
    drawText(layout.page, row.label, {
      x: MARGIN,
      y: top - sizes.label * LEADING + 2,
      font: layout.fonts.bold,
      size: sizes.label,
      color: MUTED,
    })
    drawLines(layout, valueLines, layout.fonts.body, sizes.value, MARGIN + labelWidth)
    layout.y -= 4
  }
  layout.y -= BLOCK_GAP / 2
}

function drawTable(layout: Page, block: Extract<PdfBlock, { kind: 'table' }>, sizes: Sizes): void {
  const columnWidth = CONTENT_WIDTH / block.columns.length
  const header = () => {
    layout.y -= sizes.body * LEADING
    block.columns.forEach((column, i) => {
      drawText(layout.page, column, {
        x: MARGIN + i * columnWidth,
        y: layout.y + 2,
        font: layout.fonts.bold,
        size: sizes.body,
      })
    })
    layout.page.drawLine({
      start: { x: MARGIN, y: layout.y - 3 },
      end: { x: PAGE_WIDTH - MARGIN, y: layout.y - 3 },
      color: RULE,
      thickness: 0.75,
    })
    layout.y -= 6
  }
  layout.ensure(sizes.body * LEADING * 3)
  header()
  for (const row of block.rows) {
    const cells = row.map((cell) => wrapLines(cell, layout.fonts.body, sizes.body, columnWidth - 6))
    const height = Math.max(...cells.map((c) => c.length)) * sizes.body * LEADING
    layout.ensure(height, header)
    const top = layout.y
    cells.forEach((lines, i) => {
      lines.forEach((line, n) => {
        drawText(layout.page, line, {
          x: MARGIN + i * columnWidth,
          y: top - (n + 1) * sizes.body * LEADING + 2,
          font: layout.fonts.body,
          size: sizes.body,
        })
      })
    })
    layout.y -= height
  }
  layout.y -= BLOCK_GAP
}

function drawNotice(layout: Page, text: string, sizes: Sizes): void {
  const lines = wrapLines(text, layout.fonts.bold, sizes.body, CONTENT_WIDTH - 16)
  const height = lines.length * sizes.body * LEADING + 16
  layout.ensure(height)
  layout.page.drawRectangle({
    x: MARGIN,
    y: layout.y - height,
    width: CONTENT_WIDTH,
    height,
    borderColor: INK,
    borderWidth: 1,
  })
  lines.forEach((line, n) => {
    drawText(layout.page, line, {
      x: MARGIN + 8,
      y: layout.y - 8 - (n + 1) * sizes.body * LEADING + 3,
      font: layout.fonts.bold,
      size: sizes.body,
    })
  })
  layout.y -= height + BLOCK_GAP
}

function drawBlock(layout: Page, block: PdfBlock, sizes: Sizes): void {
  switch (block.kind) {
    case 'heading':
      layout.ensure(40)
      layout.y -= 6
      drawLines(
        layout,
        wrapLines(block.text, layout.fonts.heading, 15, CONTENT_WIDTH),
        layout.fonts.heading,
        15,
        MARGIN,
      )
      layout.y -= 4
      return
    case 'paragraph':
      drawLines(
        layout,
        wrapLines(block.text, layout.fonts.body, sizes.body, CONTENT_WIDTH),
        layout.fonts.body,
        sizes.body,
        MARGIN,
      )
      layout.y -= BLOCK_GAP / 2
      return
    case 'fields':
      return drawFields(layout, block.rows, sizes)
    case 'table':
      return drawTable(layout, block, sizes)
    case 'signature':
      layout.ensure(54)
      layout.y -= 40
      layout.page.drawLine({
        start: { x: MARGIN, y: layout.y },
        end: { x: MARGIN + 240, y: layout.y },
        color: INK,
        thickness: 0.75,
      })
      drawText(layout.page, block.label, {
        x: MARGIN,
        y: layout.y - 12,
        font: layout.fonts.body,
        size: 9,
        color: MUTED,
      })
      layout.y -= 24
      return
    case 'notice':
      return drawNotice(layout, block.text, sizes)
  }
}

export async function renderPdf(spec: PdfDocumentSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    heading: await doc.embedFont(StandardFonts.TimesRoman),
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const sizes = SIZES[spec.scale]
  const layout = new Page(doc, fonts)
  drawTitle(layout, spec, sizes)
  for (const block of spec.blocks) drawBlock(layout, block, sizes)
  const pages = layout.all
  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${pages.length}`
    drawText(page, label, {
      x: (PAGE_WIDTH - fonts.body.widthOfTextAtSize(label, 9)) / 2,
      y: MARGIN / 2,
      font: fonts.body,
      size: 9,
      color: MUTED,
    })
  })
  return await doc.save({ useObjectStreams: false })
}
