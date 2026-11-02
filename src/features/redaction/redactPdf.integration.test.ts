import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as mupdf from 'mupdf'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { redactPdf } from '@/features/redaction/redactPdf'
import type { PdfBox } from '@/features/redaction/types'
import { verifyPdfRedaction } from '@/features/redaction/verifyRedaction'

const signal = new AbortController().signal
const PHONE = '603-555-0147'
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../test/fixtures/redaction/${name}`, import.meta.url))),
  )
const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})

const PHONE_LINE: PdfBox = { page: 1, x0: 60, y0: 70, x1: 320, y1: 100 }
const OCR_IMAGE: PdfBox = { page: 1, x0: 72, y0: 132, x1: 372, y1: 192 }

async function mustRedact(input: Uint8Array, boxes: PdfBox[]) {
  const result = await redactPdf(input, boxes, signal)
  if (!result.ok) throw new Error(`${result.error.reason}: ${result.error.detail}`)
  return result.value
}

function decompressed(bytes: Uint8Array): string {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  if (doc === null) throw new Error('not a pdf')
  return Buffer.from(doc.saveToBuffer('decompress=yes').asUint8Array()).toString('latin1')
}

function mupdfText(bytes: Uint8Array): string {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  let out = ''
  for (let i = 0; i < doc.countPages(); i += 1) {
    out += doc.loadPage(i).toStructuredText('preserve-whitespace').asText()
  }
  return out
}

function darkestInBox(bytes: Uint8Array, box: PdfBox): number {
  const page = mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(box.page - 1)
  const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true)
  const n = pixmap.getNumberOfComponents()
  const pixels = pixmap.getPixels()
  const stride = pixmap.getStride()
  let brightest = 0
  for (let y = Math.ceil(box.y0) + 1; y < Math.floor(box.y1) - 1; y += 1) {
    for (let x = Math.ceil(box.x0) + 1; x < Math.floor(box.x1) - 1; x += 1) {
      for (let c = 0; c < n; c += 1) {
        brightest = Math.max(brightest, pixels[y * stride + x * n + c] ?? 0)
      }
    }
  }
  return brightest
}

describe('redactPdf', () => {
  it('redacted pdf has the phone in no text layer, metadata, annotation, or decompressed stream', async () => {
    const original = fixture('letter.pdf')
    expect(Buffer.from(original).toString('latin1')).toContain(PHONE)
    const { bytes, removedText } = await mustRedact(original, [PHONE_LINE])
    expect(removedText.join(' ')).toContain(PHONE)
    const gs = await converter.extractText(bytes, signal)
    expect(gs.ok && gs.value).not.toContain(PHONE)
    expect(mupdfText(bytes)).not.toContain(PHONE)
    const raw = decompressed(bytes)
    expect(raw).not.toContain(PHONE)
    expect(raw).not.toContain(Buffer.from(PHONE, 'utf16le').swap16().toString('latin1'))
    expect(raw).not.toContain('/Annots')
    expect(raw).not.toContain('/Info')
    expect(raw).not.toContain('/Title')
    expect(verifyPdfRedaction(bytes, removedText)).toEqual({ ok: true, value: undefined })
  })

  it('text outside the box survives', async () => {
    const { bytes } = await mustRedact(fixture('letter.pdf'), [PHONE_LINE])
    const gs = await converter.extractText(bytes, signal)
    expect(gs.ok && gs.value).toContain('Permit BP-2027-0001')
    expect(mupdfText(bytes)).toContain('Inspection scheduled')
  })

  it('pixels inside the box render black', async () => {
    const { bytes } = await mustRedact(fixture('letter.pdf'), [PHONE_LINE])
    expect(darkestInBox(bytes, PHONE_LINE)).toBeLessThan(16)
  })

  it('hidden ocr layer under a box is removed and the image pixels are blacked', async () => {
    const original = fixture('scanned-with-ocr.pdf')
    expect(mupdfText(original)).toContain(PHONE)
    const { bytes, removedText } = await mustRedact(original, [OCR_IMAGE])
    expect(removedText.join(' ')).toContain(PHONE)
    expect(mupdfText(bytes)).not.toContain(PHONE)
    expect(decompressed(bytes)).not.toContain(PHONE)
    expect(darkestInBox(bytes, OCR_IMAGE)).toBeLessThan(16)
  })

  it('encrypted pdf is encrypted', async () => {
    const doc = mupdf.Document.openDocument(fixture('letter.pdf'), 'application/pdf').asPDF()
    const encrypted = doc
      ?.saveToBuffer('encrypt=aes-256,user-password=alder,owner-password=pond')
      .asUint8Array()
    if (encrypted === undefined) throw new Error('encrypt failed')
    const result = await redactPdf(encrypted, [PHONE_LINE], signal)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.reason).toBe('encrypted')
  })

  it('box past the page edge is box_out_of_bounds', async () => {
    const past = await redactPdf(fixture('letter.pdf'), [{ ...PHONE_LINE, x1: 700 }], signal)
    expect(!past.ok && past.error.reason).toBe('box_out_of_bounds')
    const page = await redactPdf(fixture('letter.pdf'), [{ ...PHONE_LINE, page: 2 }], signal)
    expect(!page.ok && page.error.reason).toBe('box_out_of_bounds')
  })

  it('a word that also appears outside the box does not fail verification and stays outside', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([612, 792])
    page.drawText('Smith applied', { x: 72, y: 700, size: 14, font })
    page.drawText('Smith signed below', { x: 72, y: 600, size: 14, font })
    const { bytes } = await mustRedact(await doc.save(), [
      { page: 1, x0: 60, y0: 70, x1: 300, y1: 100 },
    ])
    const text = mupdfText(bytes)
    expect(text).toContain('Smith signed below')
    expect(text).not.toContain('Smith applied')
  })

  it('bytes that are not a pdf are unreadable', async () => {
    const result = await redactPdf(new TextEncoder().encode('not a pdf'), [PHONE_LINE], signal)
    expect(!result.ok && result.error.reason).toBe('unreadable')
  })

  it('verification catches text left in a stream', () => {
    const result = verifyPdfRedaction(fixture('letter.pdf'), [PHONE])
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.found).toContain(PHONE)
  })
})
