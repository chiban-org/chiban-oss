import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import type { DocumentFrame, FrameImage } from '@/features/pdf/frame'
import type { Fonts } from '@/features/pdf/pdfFonts'
import {
  CONTENT_WIDTH,
  drawRule,
  drawText,
  MARGIN,
  MUTED,
  PAGE_WIDTH,
  textWidth,
  wrapLines,
} from '@/features/pdf/pdfLayout'

export interface Size {
  width: number
  height: number
}

export async function embedImage(doc: PDFDocument, image: FrameImage): Promise<PDFImage> {
  return image.contentType === 'image/png'
    ? await doc.embedPng(image.bytes)
    : await doc.embedJpg(image.bytes)
}

export function fitWithin(image: Size, box: Size): Size {
  const scale = Math.min(box.width / image.width, box.height / image.height, 1)
  return { width: image.width * scale, height: image.height * scale }
}

interface HeaderLine {
  text: string
  font: PDFFont
  size: number
  muted: boolean
}

const LOGO_BOX: Size = { width: 120, height: 58 }
const PLACARD_LOGO_BOX: Size = { width: 160, height: 84 }
const LOGO_GAP = 14
const RULE_GAP = 12
const LEADING = 1.3

function headerLines(fonts: Fonts, frame: DocumentFrame, width: number): HeaderLine[] {
  const line = (text: string, font: PDFFont, size: number, muted: boolean) =>
    wrapLines(text, font, size, width).map((t) => ({ text: t, font, size, muted }))
  return [
    ...line(frame.townName, fonts.heading, 15, false),
    ...(frame.officeName === '' ? [] : line(frame.officeName, fonts.bold, 10, false)),
    ...frame.headerLines.flatMap((text) => line(text, fonts.body, 8.5, true)),
  ]
}

function drawLines(page: PDFPage, lines: HeaderLine[], top: number, x: (l: HeaderLine) => number) {
  let y = top
  for (const l of lines) {
    y -= l.size * LEADING
    drawText(page, l.text, {
      x: x(l),
      y: y + l.size * 0.25,
      font: l.font,
      size: l.size,
      ...(l.muted ? { color: MUTED } : {}),
    })
  }
  return top - y
}

const centered = (l: HeaderLine) => (PAGE_WIDTH - textWidth(l.font, l.text, l.size)) / 2

export interface FrameArt {
  fonts: Fonts
  frame: DocumentFrame
  logo: PDFImage | null
}

export function drawLetterhead(page: PDFPage, art: FrameArt, top: number): number {
  const { fonts, frame, logo } = art
  const size = logo === null ? null : fitWithin(logo, LOGO_BOX)
  let height: number
  if (frame.logoPosition === 'center') {
    const logoHeight = size === null ? 0 : size.height + 8
    if (logo !== null && size !== null) {
      page.drawImage(logo, { x: (PAGE_WIDTH - size.width) / 2, y: top - size.height, ...size })
    }
    const lines = headerLines(fonts, frame, CONTENT_WIDTH)
    height = logoHeight + drawLines(page, lines, top - logoHeight, centered)
  } else {
    const indent = size === null ? 0 : size.width + LOGO_GAP
    if (logo !== null && size !== null) {
      page.drawImage(logo, { x: MARGIN, y: top - size.height, ...size })
    }
    const lines = headerLines(fonts, frame, CONTENT_WIDTH - indent)
    height = Math.max(
      size?.height ?? 0,
      drawLines(page, lines, top, () => MARGIN + indent),
    )
  }
  const ruleY = top - height - RULE_GAP / 2
  drawRule(page, ruleY)
  return ruleY - RULE_GAP
}

export function drawPlacardHeader(page: PDFPage, art: FrameArt, top: number): number {
  const { fonts, frame, logo } = art
  let y = top
  if (logo !== null) {
    const size = fitWithin(logo, PLACARD_LOGO_BOX)
    page.drawImage(logo, { x: (PAGE_WIDTH - size.width) / 2, y: y - size.height, ...size })
    y -= size.height + 10
  }
  const lines = wrapLines(frame.townName, fonts.heading, 20, CONTENT_WIDTH).map((text) => ({
    text,
    font: fonts.heading,
    size: 20,
    muted: false,
  }))
  y -= drawLines(page, lines, y, centered)
  return y - RULE_GAP
}

const FOOTER_SIZE = 8
const PAGE_LABEL_GAP = 24

export function drawFooter(
  page: PDFPage,
  art: FrameArt,
  pageIndex: number,
  pageCount: number,
): void {
  const { fonts, frame } = art
  const label = frame.pageNumbers ? `Page ${pageIndex + 1} of ${pageCount}` : ''
  const labelWidth = label === '' ? 0 : textWidth(fonts.body, label, FOOTER_SIZE)
  const baseline = MARGIN / 2
  if (label !== '') {
    drawText(page, label, {
      x: PAGE_WIDTH - MARGIN - labelWidth,
      y: baseline,
      font: fonts.body,
      size: FOOTER_SIZE,
      color: MUTED,
    })
  }
  if (frame.footerText === '') return
  const width = CONTENT_WIDTH - (label === '' ? 0 : labelWidth + PAGE_LABEL_GAP)
  const lines = wrapLines(frame.footerText, fonts.body, FOOTER_SIZE, width).slice(0, 2)
  lines.forEach((line, n) => {
    drawText(page, line, {
      x: MARGIN,
      y: baseline + (lines.length - 1 - n) * FOOTER_SIZE * LEADING,
      font: fonts.body,
      size: FOOTER_SIZE,
      color: MUTED,
    })
  })
}
