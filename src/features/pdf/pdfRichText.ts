import type { PDFFont } from 'pdf-lib'
import { splitToWidth } from '@/features/pdf/fitWidth'
import { type Fonts, printable } from '@/features/pdf/pdfFonts'
import { CONTENT_WIDTH, drawText, LEADING, MARGIN } from '@/features/pdf/pdfLayout'
import type { PageCursor } from '@/features/pdf/pdfPage'
import type { PdfListItem, TextRun } from '@/features/pdf/pdfSpec'

export interface Piece {
  text: string
  font: PDFFont
}

interface Word {
  pieces: Piece[]
  hardBreak: boolean
  glued?: boolean
}

const LIST_INDENT = 18
const MARKER_GAP = 16

function fontFor(run: TextRun, fonts: Fonts): PDFFont {
  if (run.bold === true) return fonts.bold
  return run.italic === true ? fonts.italic : fonts.body
}

function runWords(runs: readonly TextRun[], fonts: Fonts): Word[] {
  const words: Word[] = []
  let current: Word | null = null
  const finish = () => {
    if (current !== null && current.pieces.length > 0) words.push(current)
    current = null
  }
  for (const run of runs) {
    const font = fontFor(run, fonts)
    for (const part of run.text.split(/(\n|[ \t\r]+)/)) {
      if (part === '') continue
      if (part === '\n') {
        finish()
        words.push({ pieces: [], hardBreak: true })
      } else if (part.trim() === '') {
        finish()
      } else {
        current ??= { pieces: [], hardBreak: false }
        current.pieces.push({ text: printable(font, part), font })
      }
    }
  }
  finish()
  return words
}

function splitPiece(piece: Piece, size: number, width: number): Piece[] {
  return splitToWidth(piece.font, piece.text, size, width).map((text) => ({
    text,
    font: piece.font,
  }))
}

function fitWords(words: Word[], size: number, width: number): Word[] {
  return words.flatMap((word) => {
    if (word.hardBreak || piecesWidth(word.pieces, size) <= width) return [word]
    const chunks = word.pieces.flatMap((piece) => splitPiece(piece, size, width))
    return chunks.map((chunk, i): Word => ({ pieces: [chunk], hardBreak: false, glued: i > 0 }))
  })
}

const piecesWidth = (pieces: readonly Piece[], size: number) =>
  pieces.reduce((sum, p) => sum + p.font.widthOfTextAtSize(p.text, size), 0)

function append(line: Piece[], pieces: readonly Piece[]): void {
  for (const piece of pieces) {
    const last = line.at(-1)
    if (last?.font === piece.font) last.text += piece.text
    else line.push({ ...piece })
  }
}

export function layoutRuns(
  runs: readonly TextRun[],
  fonts: Fonts,
  size: number,
  width: number,
): Piece[][] {
  const lines: Piece[][] = []
  let line: Piece[] = []
  let used = 0
  const push = () => {
    lines.push(line)
    line = []
    used = 0
  }
  for (const word of fitWords(runWords(runs, fonts), size, width)) {
    if (word.hardBreak) {
      push()
      continue
    }
    const wordWidth = piecesWidth(word.pieces, size)
    const last = line.at(-1)
    const space =
      last === undefined || word.glued === true ? 0 : last.font.widthOfTextAtSize(' ', size)
    if (last !== undefined && used + space + wordWidth > width) push()
    const tail = line.at(-1)
    if (tail !== undefined && word.glued !== true) {
      tail.text += ' '
      used += space
    }
    append(line, word.pieces)
    used += wordWidth
  }
  if (line.length > 0 || lines.length === 0) push()
  return lines
}

function drawPieces(layout: PageCursor, lines: Piece[][], x: number, size: number) {
  for (const line of lines) {
    layout.ensure(size * LEADING)
    layout.y -= size * LEADING
    let at = x
    for (const piece of line) {
      drawText(layout.page, piece.text, {
        x: at,
        y: layout.y + size * 0.25,
        font: piece.font,
        size,
      })
      at += piece.font.widthOfTextAtSize(piece.text, size)
    }
  }
}

export function drawRuns(layout: PageCursor, runs: readonly TextRun[], size: number): void {
  drawPieces(layout, layoutRuns(runs, layout.fonts, size, CONTENT_WIDTH), MARGIN, size)
}

export function drawListItems(
  layout: PageCursor,
  items: readonly PdfListItem[],
  size: number,
): void {
  for (const item of items) {
    const indent = MARGIN + item.depth * LIST_INDENT
    const textX = indent + MARKER_GAP
    const lines = layoutRuns(item.runs, layout.fonts, size, CONTENT_WIDTH - (textX - MARGIN))
    layout.ensure(size * LEADING)
    if (item.marker !== '') {
      drawText(layout.page, item.marker, {
        x: indent,
        y: layout.y - size * LEADING + size * 0.25,
        font: layout.fonts.body,
        size,
      })
    }
    drawPieces(layout, lines, textX, size)
  }
}
