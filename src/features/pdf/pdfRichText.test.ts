import * as mupdf from 'mupdf'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { plainFrame } from '@/features/pdf/frame'
import { embedFonts } from '@/features/pdf/pdfFonts'
import { layoutRuns } from '@/features/pdf/pdfRichText'
import { renderPdf } from '@/features/pdf/renderPdf'
import { pdfText } from '@/test/pdfText'

function fontOfWord(bytes: Uint8Array, word: string): string {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  let text = ''
  const fonts: string[] = []
  doc
    .loadPage(0)
    .toStructuredText('preserve-whitespace')
    .walk({
      onChar(char: string, _origin: unknown, font: mupdf.Font) {
        text += char
        fonts.push(font.getName())
      },
    })
  const at = text.indexOf(word)
  return at === -1 ? '' : (fonts[at] ?? '')
}

describe('rich text and lists in PDFs', () => {
  it('draws bold and italic runs in the bold and italic faces', async () => {
    const bytes = await renderPdf({
      title: 'Letter',
      frame: plainFrame('Alder Pond'),
      scale: 'document',
      blocks: [
        { kind: 'text', runs: [{ text: 'Plain ' }, { text: 'Strong', bold: true }] },
        { kind: 'text', runs: [{ text: 'Leaning', italic: true }] },
      ],
    })
    const text = await pdfText(bytes)
    expect(text).toContain('Plain Strong')
    expect(text).toContain('Leaning')
    expect(fontOfWord(bytes, 'Strong')).toMatch(/Bold/)
    expect(fontOfWord(bytes, 'Plain')).toMatch(/Regular/)
    expect(fontOfWord(bytes, 'Leaning')).toMatch(/Italic/)
  })

  it('draws numbered and bulleted list items with their markers', async () => {
    const text = await pdfText(
      await renderPdf({
        title: 'Letter',
        frame: plainFrame('Alder Pond'),
        scale: 'document',
        blocks: [
          {
            kind: 'list',
            items: [
              { marker: '1.', depth: 0, runs: [{ text: 'File the survey.' }] },
              { marker: '•', depth: 1, runs: [{ text: 'Stamped copy.' }] },
            ],
          },
        ],
      }),
    )
    expect(text).toMatch(/1\.\s*File the survey\./)
    expect(text).toMatch(/•\s*Stamped copy\./)
  })

  it('wraps long runs and keeps hard breaks', async () => {
    const doc = await PDFDocument.create()
    const fonts = await embedFonts(doc)
    const lines = layoutRuns(
      [{ text: `${'word '.repeat(40)}\nnext line`, bold: false }],
      fonts,
      10.5,
      200,
    )
    expect(lines.length).toBeGreaterThan(3)
    expect(
      lines
        .at(-1)
        ?.map((p) => p.text)
        .join(''),
    ).toBe('next line')
  })

  it('splits a word wider than the line', async () => {
    const doc = await PDFDocument.create()
    const fonts = await embedFonts(doc)
    const url = `https://example.org/${'segment'.repeat(30)}`
    const lines = layoutRuns([{ text: `See ${url} now`, bold: true }], fonts, 10.5, 150)
    for (const line of lines) {
      const width = line.reduce(
        (sum, p) => sum + p.font.widthOfTextAtSize(p.text.trimEnd(), 10.5),
        0,
      )
      expect(width).toBeLessThanOrEqual(150)
    }
    expect(
      lines
        .map((l) => l.map((p) => p.text).join(''))
        .join('')
        .replaceAll(' ', ''),
    ).toBe(`See${url}now`)
  })
})
