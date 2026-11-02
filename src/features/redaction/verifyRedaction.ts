import * as mupdf from 'mupdf'
import { err, ok, type Result } from '@/types/result'

export type RetainedCounts = ReadonlyMap<string, number>

function utf16be(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    out += String.fromCharCode((code >> 8) & 0xff, code & 0xff)
  }
  return out
}

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  return haystack.split(needle).length - 1
}

export function pdfPageText(doc: mupdf.Document): string {
  let out = ''
  for (let i = 0; i < doc.countPages(); i += 1) {
    out += `${doc.loadPage(i).toStructuredText('preserve-whitespace').asText()}\n`
  }
  return out
}

export function openPdf(bytes: Uint8Array): mupdf.PDFDocument | null {
  try {
    return mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()
  } catch {
    return null
  }
}

function decompressedLatin1(doc: mupdf.PDFDocument): string {
  return Buffer.from(doc.saveToBuffer('decompress=yes').asUint8Array()).toString('latin1')
}

function metadataFound(doc: mupdf.PDFDocument): string[] {
  const found: string[] = []
  if (!doc.getTrailer().get('Info').isNull()) found.push('document information dictionary')
  if (!doc.getTrailer().get('Root', 'Metadata').isNull()) found.push('XMP metadata')
  return found
}

export function verifyPdfRedaction(
  output: Uint8Array,
  removedText: string[],
  retained: RetainedCounts = new Map(),
): Result<void, { found: string[] }> {
  const doc = openPdf(output)
  if (doc === null) return err({ found: ['unreadable output'] })
  const pageText = pdfPageText(doc)
  const raw = decompressedLatin1(doc)
  const found = new Set<string>()
  for (const entry of new Set(removedText)) {
    const allowed = retained.get(entry) ?? 0
    if (occurrences(pageText, entry) > allowed) found.add(entry)
    const latin = occurrences(raw, entry) + occurrences(raw, utf16be(entry))
    if (latin > allowed) found.add(entry)
  }
  for (const marker of metadataFound(doc)) found.add(marker)
  return found.size === 0 ? ok(undefined) : err({ found: [...found] })
}
