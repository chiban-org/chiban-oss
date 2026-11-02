import * as mupdf from 'mupdf'
import type { PdfBox, PdfRedactionFailure, RedactionResult } from '@/features/redaction/types'
import {
  openPdf,
  pdfPageText,
  type RetainedCounts,
  verifyPdfRedaction,
} from '@/features/redaction/verifyRedaction'
import { err, ok, type Result } from '@/types/result'

const MIN_RUN = 4
const ROOT_KEYS = [
  'Metadata',
  'Names',
  'OpenAction',
  'AcroForm',
  'Outlines',
  'PieceInfo',
  'AA',
  'Threads',
  'StructTreeRoot',
  'MarkInfo',
]
const PAGE_KEYS = ['Annots', 'Metadata', 'PieceInfo', 'AA', 'B', 'StructParents']
const SAVE_OPTIONS = 'garbage=deduplicate,compress=yes,clean=yes,sanitize=yes'

type Failure = Result<never, PdfRedactionFailure>

function fail(reason: PdfRedactionFailure['reason'], detail: string): Failure {
  return err({ reason, detail })
}

function boxWithinPage(box: PdfBox, page: mupdf.Page): boolean {
  const [px0, py0, px1, py1] = page.getBounds()
  const values = [box.x0, box.y0, box.x1, box.y1]
  return (
    values.every(Number.isFinite) &&
    box.x0 < box.x1 &&
    box.y0 < box.y1 &&
    box.x0 >= px0 &&
    box.y0 >= py0 &&
    box.x1 <= px1 &&
    box.y1 <= py1
  )
}

function quadHitsBox(quad: mupdf.Quad, box: PdfBox): boolean {
  const xs = [quad[0], quad[2], quad[4], quad[6]]
  const ys = [quad[1], quad[3], quad[5], quad[7]]
  return (
    Math.min(...xs) < box.x1 &&
    Math.max(...xs) > box.x0 &&
    Math.min(...ys) < box.y1 &&
    Math.max(...ys) > box.y0
  )
}

function textUnderBox(page: mupdf.Page, box: PdfBox): string[] {
  const lines: string[] = []
  let current = ''
  page.toStructuredText('preserve-whitespace').walk({
    beginLine() {
      current = ''
    },
    onChar(c, _origin, _font, _size, quad) {
      current += quadHitsBox(quad, box) ? c : ' '
    },
    endLine() {
      lines.push(current)
    },
  })
  return lines.flatMap((line) => line.split(/\s+/).filter((token) => token.length >= MIN_RUN))
}

function retainedCounts(originalText: string, removed: string[]): RetainedCounts {
  const counts = new Map<string, number>()
  for (const token of new Set(removed)) {
    const total = originalText.split(token).length - 1
    const taken = removed.filter((r) => r === token).length
    counts.set(token, Math.max(0, total - taken))
  }
  return counts
}

function stripEverythingElse(doc: mupdf.PDFDocument): void {
  const trailer = doc.getTrailer()
  trailer.delete('Info')
  const root = trailer.get('Root')
  for (const key of ROOT_KEYS) root.delete(key)
  for (let i = 0; i < doc.countPages(); i += 1) {
    const page = doc.loadPage(i)
    for (const annotation of page.getAnnotations()) page.deleteAnnotation(annotation)
    const object = page.getObject()
    for (const key of PAGE_KEYS) object.delete(key)
  }
}

export async function redactPdf(
  input: Uint8Array,
  boxes: PdfBox[],
  signal: AbortSignal,
): Promise<Result<RedactionResult, PdfRedactionFailure>> {
  signal.throwIfAborted()
  const doc = openPdf(input)
  if (doc === null) return fail('unreadable', 'The file is not a readable PDF')
  if (doc.needsPassword()) return fail('encrypted', 'The PDF is password protected')
  const pageCount = doc.countPages()
  const originalText = pdfPageText(doc)
  const removedText: string[] = []
  for (const box of boxes) {
    if (!Number.isInteger(box.page) || box.page < 1 || box.page > pageCount) {
      return fail('box_out_of_bounds', `Page ${box.page} does not exist`)
    }
    if (!boxWithinPage(box, doc.loadPage(box.page - 1))) {
      return fail('box_out_of_bounds', `A box on page ${box.page} reaches past the page edge`)
    }
  }
  for (const box of boxes) removedText.push(...textUnderBox(doc.loadPage(box.page - 1), box))
  const pagesWithBoxes = new Set(boxes.map((b) => b.page))
  for (const pageNumber of pagesWithBoxes) {
    const page = doc.loadPage(pageNumber - 1)
    for (const box of boxes.filter((b) => b.page === pageNumber)) {
      const annotation = page.createAnnotation('Redact')
      annotation.setRect([box.x0, box.y0, box.x1, box.y1])
    }
    page.applyRedactions(
      true,
      mupdf.PDFPage.REDACT_IMAGE_PIXELS,
      mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
      mupdf.PDFPage.REDACT_TEXT_REMOVE,
    )
  }
  stripEverythingElse(doc)
  const bytes = doc.saveToBuffer(SAVE_OPTIONS).asUint8Array()
  const checked = verifyPdfRedaction(bytes, removedText, retainedCounts(originalText, removedText))
  if (!checked.ok) {
    return fail(
      'verification_failed',
      `Removed text is still present: ${checked.error.found.length} item(s)`,
    )
  }
  return ok({ bytes, removedText })
}
