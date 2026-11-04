import type { PDFFont, PDFImage } from 'pdf-lib'
import { type DocumentFrame, type FrameSigner, signerFor } from '@/features/pdf/frame'
import { fitWithin } from '@/features/pdf/pdfFrame'
import {
  CONTENT_WIDTH,
  drawRule,
  drawText,
  INK,
  LEADING,
  MARGIN,
  MUTED,
  wrapLines,
} from '@/features/pdf/pdfLayout'
import type { PageCursor } from '@/features/pdf/pdfPage'
import { drawListItems, drawRuns } from '@/features/pdf/pdfRichText'
import type { PdfBlock, PdfDocumentSpec, SignaturePerson } from '@/features/pdf/pdfSpec'
import type { SignerRole } from '@/features/town/profileSchema'

export { LEADING }

export interface Sizes {
  title: number
  body: number
  value: number
  label: number
}

export const SIZES: Record<PdfDocumentSpec['scale'], Sizes> = {
  document: { title: 22, body: 10.5, value: 10.5, label: 9 },
  placard: { title: 48, body: 16, value: 24, label: 12 },
}

export const BLOCK_GAP = 12
const LABEL_COLUMN = 130
const SIGNATURE_BOX = { width: 180, height: 44 }
const SIGNATURE_RULE = 240

export interface BlockContext {
  layout: PageCursor
  sizes: Sizes
  frame: DocumentFrame
  signatures: ReadonlyMap<SignerRole, PDFImage>
}

function drawLines(layout: PageCursor, lines: string[], font: PDFFont, size: number): void {
  for (const line of lines) {
    layout.ensure(size * LEADING)
    layout.y -= size * LEADING
    drawText(layout.page, line, { x: MARGIN, y: layout.y + size * 0.25, font, size })
  }
}

function drawFields(ctx: BlockContext, rows: { label: string; value: string }[]): void {
  const { layout, sizes } = ctx
  const labelWidth = sizes.label === SIZES.placard.label ? 150 : LABEL_COLUMN
  const valueWidth = CONTENT_WIDTH - labelWidth
  for (const row of rows) {
    const valueLines = wrapLines(row.value, layout.fonts.body, sizes.value, valueWidth)
    layout.ensure(valueLines.length * sizes.value * LEADING)
    drawText(layout.page, row.label, {
      x: MARGIN,
      y: layout.y - sizes.label * LEADING + 2,
      font: layout.fonts.bold,
      size: sizes.label,
      color: MUTED,
    })
    for (const line of valueLines) {
      layout.ensure(sizes.value * LEADING)
      layout.y -= sizes.value * LEADING
      drawText(layout.page, line, {
        x: MARGIN + labelWidth,
        y: layout.y + sizes.value * 0.25,
        font: layout.fonts.body,
        size: sizes.value,
      })
    }
    layout.y -= 4
  }
  layout.y -= BLOCK_GAP / 2
}

function drawTable(ctx: BlockContext, block: Extract<PdfBlock, { kind: 'table' }>): void {
  const { layout, sizes } = ctx
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
    drawRule(layout.page, layout.y - 3)
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

function drawNotice(ctx: BlockContext, text: string): void {
  const { layout, sizes } = ctx
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

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

type SignatureBlock = Extract<PdfBlock, { kind: 'signature' }>

export function signingSigner(frame: DocumentFrame, block: SignatureBlock): FrameSigner | null {
  const signer = signerFor(frame, block.role)
  if (signer === null) return null
  return block.person === undefined || sameName(signer.name, block.person.name) ? signer : null
}

function signatureParts(ctx: BlockContext, block: SignatureBlock) {
  const signer = signingSigner(ctx.frame, block)
  const person: SignaturePerson | null = block.person ?? signerFor(ctx.frame, block.role)
  return { person, image: signer === null ? null : (ctx.signatures.get(block.role) ?? null) }
}

function drawSignature(ctx: BlockContext, block: SignatureBlock): void {
  const { layout } = ctx
  const { person, image } = signatureParts(ctx, block)
  const size = image === null ? null : fitWithin(image, SIGNATURE_BOX)
  const space = size === null ? 40 : size.height + 6
  layout.ensure(space + (person === null ? 24 : 34))
  layout.y -= space
  if (image !== null && size !== null) {
    layout.page.drawImage(image, { x: MARGIN, y: layout.y + 3, ...size })
  }
  layout.page.drawLine({
    start: { x: MARGIN, y: layout.y },
    end: { x: MARGIN + SIGNATURE_RULE, y: layout.y },
    color: INK,
    thickness: 0.75,
  })
  const fonts = layout.fonts
  if (person === null) {
    drawText(layout.page, block.label, {
      x: MARGIN,
      y: layout.y - 12,
      font: fonts.body,
      size: 9,
      color: MUTED,
    })
    layout.y -= 24
    return
  }
  drawText(layout.page, person.name, { x: MARGIN, y: layout.y - 13, font: fonts.bold, size: 10 })
  drawText(layout.page, person.title, {
    x: MARGIN,
    y: layout.y - 25,
    font: fonts.body,
    size: 9,
    color: MUTED,
  })
  layout.y -= 34
}

export function drawBlock(ctx: BlockContext, block: PdfBlock): void {
  const { layout, sizes } = ctx
  switch (block.kind) {
    case 'heading':
      layout.ensure(40)
      layout.y -= 6
      drawLines(
        layout,
        wrapLines(block.text, layout.fonts.heading, 15, CONTENT_WIDTH),
        layout.fonts.heading,
        15,
      )
      layout.y -= 4
      return
    case 'paragraph':
      drawLines(
        layout,
        wrapLines(block.text, layout.fonts.body, sizes.body, CONTENT_WIDTH),
        layout.fonts.body,
        sizes.body,
      )
      layout.y -= BLOCK_GAP / 2
      return
    case 'text':
      drawRuns(layout, block.runs, sizes.body)
      layout.y -= BLOCK_GAP / 2
      return
    case 'list':
      drawListItems(layout, block.items, sizes.body)
      layout.y -= BLOCK_GAP / 2
      return
    case 'fields':
      return drawFields(ctx, block.rows)
    case 'table':
      return drawTable(ctx, block)
    case 'signature':
      return drawSignature(ctx, block)
    case 'notice':
      return drawNotice(ctx, block.text)
  }
}
