import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { type PdfDocumentSpec, renderPdf } from '@/features/pdf/renderPdf'
import { toWinAnsi } from '@/features/pdf/winAnsi'
import { pdfPages, pdfText } from '@/test/pdfText'

const SHORT: PdfDocumentSpec = {
  title: 'Electrical Permit',
  subtitle: 'EL-2027-0001',
  townName: 'Town of Alder Pond',
  scale: 'document',
  blocks: [
    { kind: 'heading', text: 'Details' },
    { kind: 'paragraph', text: 'Permission is granted for the work described below.' },
    {
      kind: 'fields',
      rows: [
        { label: 'Number', value: 'EL-2027-0001' },
        { label: 'Contractor', value: 'Pat Contractor' },
      ],
    },
    { kind: 'signature', label: 'Building inspector' },
    { kind: 'notice', text: 'Post this where it can be seen.' },
  ],
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

describe('renderPdf', () => {
  it('rendered pdf starts with %PDF- and has one page for a short spec', async () => {
    const bytes = await renderPdf(SHORT)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(await pageCount(bytes)).toBe(1)
  })

  it('draws the title, the town, and the field values', async () => {
    const text = await pdfText(await renderPdf(SHORT))
    expect(text).toContain('Electrical Permit')
    expect(text).toContain('TOWN OF ALDER POND')
    expect(text).toContain('EL-2027-0001')
    expect(text).toContain('Pat Contractor')
    expect(text).toContain('Page 1 of 1')
  })

  it('a 200-row table breaks across pages with page numbers', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => [
      `Row ${i + 1}`,
      'Electrical permit fee',
      '45.00',
    ])
    const bytes = await renderPdf({
      ...SHORT,
      blocks: [{ kind: 'table', columns: ['Item', 'Fee', 'Amount'], rows }],
    })
    const pages = await pdfPages(bytes)
    expect(pages.length).toBeGreaterThan(2)
    expect(pages.at(-1)).toContain(`Page ${pages.length} of ${pages.length}`)
    expect(pages[1]).toContain('Item')
    expect(pages.join('\n')).toContain('Row 200')
  })

  it('name outside WinAnsi renders without throwing', async () => {
    const bytes = await renderPdf({
      ...SHORT,
      blocks: [{ kind: 'fields', rows: [{ label: 'Payer', value: 'Zoë Łukasz-Ngũgĩ 山田' }] }],
    })
    expect(await pdfText(bytes)).toContain('Zoë Lukasz-Ngugi ??')
  })

  it('a long unbroken value wraps instead of running off the page', async () => {
    const bytes = await renderPdf({
      ...SHORT,
      blocks: [{ kind: 'paragraph', text: 'W'.repeat(400) }],
    })
    expect(await pageCount(bytes)).toBe(1)
  })

  it('placard scale sets one large page', async () => {
    const bytes = await renderPdf({
      title: 'ELECTRICAL PERMIT',
      townName: 'Town of Alder Pond',
      scale: 'placard',
      blocks: [
        {
          kind: 'fields',
          rows: [
            { label: 'Number', value: 'EL-2027-0001' },
            { label: 'Site address', value: '14 Pond Road' },
            { label: 'Contractor', value: 'Pat Contractor' },
          ],
        },
        { kind: 'notice', text: 'Post this placard where it can be seen from the street.' },
      ],
    })
    expect(await pageCount(bytes)).toBe(1)
  })
})

describe('toWinAnsi', () => {
  it('keeps é and turns Ł into L', () => {
    expect(toWinAnsi('é')).toBe('é')
    expect(toWinAnsi('Ł')).toBe('L')
  })

  it('uses the base letter of a decomposable character', () => {
    expect(toWinAnsi('ũ')).toBe('u')
  })

  it('replaces characters with no WinAnsi form by a question mark', () => {
    expect(toWinAnsi('山')).toBe('?')
  })

  it('turns line breaks and tabs into spaces', () => {
    expect(toWinAnsi('a\nb\tc')).toBe('a b c')
  })
})
