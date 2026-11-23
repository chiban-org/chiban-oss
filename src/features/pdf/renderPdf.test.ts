import * as mupdf from 'mupdf'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { buildFrame, type DocumentFrame, plainFrame } from '@/features/pdf/frame'
import { type PdfDocumentSpec, renderPdf } from '@/features/pdf/renderPdf'
import { toWinAnsi } from '@/features/pdf/winAnsi'
import { imageCount, PROFILE, profileFrame } from '@/test/frameFixtures'
import { pdfPages, pdfText } from '@/test/pdfText'

const SHORT: PdfDocumentSpec = {
  title: 'Electrical Permit',
  subtitle: 'EL-2027-0001',
  frame: plainFrame('Town of Alder Pond'),
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
    { kind: 'signature', role: 'building_official', label: 'Building inspector' },
    { kind: 'notice', text: 'Post this where it can be seen.' },
  ],
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

const TALL_TABLE = {
  kind: 'table' as const,
  columns: ['Item', 'Fee', 'Amount'],
  rows: Array.from({ length: 200 }, (_, i) => [`Row ${i + 1}`, 'Electrical permit fee', '45.00']),
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
    expect(text).toContain('Town of Alder Pond')
    expect(text).toContain('EL-2027-0001')
    expect(text).toContain('Pat Contractor')
    expect(text).toContain('Page 1 of 1')
  })

  it('wraps a long field label inside its column so it does not print over the value', async () => {
    const label = `Description of ${'every item that the application covers, '.repeat(5)}`
    const bytes = await renderPdf({
      ...SHORT,
      blocks: [{ kind: 'fields', rows: [{ label, value: 'Value on the right' }] }],
    })
    const page = JSON.parse(
      mupdf.Document.openDocument(bytes, 'application/pdf')
        .loadPage(0)
        .toStructuredText('preserve-whitespace')
        .asJSON(),
    ) as { blocks: { lines: { bbox: { x: number; w: number }; text: string }[] }[] }
    const lines = page.blocks.flatMap((b) => b.lines)
    const valueLine = lines.find((l) => l.text === 'Value on the right')
    const labelLines = lines.filter((l) => label.includes(l.text.trim()) && l.text.trim() !== '')
    expect(valueLine).toBeDefined()
    expect(labelLines.length).toBeGreaterThan(1)
    for (const line of labelLines) {
      expect(line.bbox.x + line.bbox.w, line.text).toBeLessThanOrEqual(valueLine?.bbox.x ?? 0)
    }
    expect(labelLines.map((l) => l.text.trim()).join(' ')).toContain('every item')
  })

  it('requires a frame on every spec', async () => {
    expectTypeOf<Pick<PdfDocumentSpec, 'frame'>>().toEqualTypeOf<{ frame: DocumentFrame }>()
    const { frame: _frame, ...withoutFrame } = SHORT
    await expect(renderPdf(withoutFrame as PdfDocumentSpec)).rejects.toThrow(/frame/)
  })

  it('draws the letterhead header and footer on every page', async () => {
    const pages = await pdfPages(
      await renderPdf({ ...SHORT, frame: await profileFrame(false), blocks: [TALL_TABLE] }),
    )
    expect(pages.length).toBeGreaterThan(2)
    for (const [index, page] of pages.entries()) {
      expect(page).toContain('Town of Alder Pond')
      expect(page).toContain('Land Use Office')
      expect(page).toContain('1 Main Street, Alder Pond, NH 03000')
      expect(page).toContain('Phone 603-555-0100')
      expect(page).toContain('Keep this permit on site.')
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`)
    }
    expect(pages[1]).toContain('Item')
    expect(pages.join('\n')).toContain('Row 200')
  })

  it('leaves the page numbers off when the letterhead turns them off', async () => {
    const frame = buildFrame(
      'Town of Alder Pond',
      { ...PROFILE, letterhead: { ...PROFILE.letterhead, pageNumbers: false } },
      undefined,
      new Map(),
    )
    expect(await pdfText(await renderPdf({ ...SHORT, frame }))).not.toContain('Page 1 of 1')
  })

  it('embeds the logo once however many pages draw it', async () => {
    const one = await renderPdf({ ...SHORT, frame: await profileFrame(), blocks: [] })
    const many = await renderPdf({ ...SHORT, frame: await profileFrame(), blocks: [TALL_TABLE] })
    expect(await imageCount(one)).toBe(1)
    expect(await imageCount(many)).toBe(1)
  })

  it('a placard draws a reduced header with the logo and town name only', async () => {
    const bytes = await renderPdf({
      title: 'ELECTRICAL PERMIT',
      frame: await profileFrame(),
      scale: 'placard',
      blocks: [
        { kind: 'fields', rows: [{ label: 'Number', value: 'EL-2027-0001' }] },
        { kind: 'notice', text: 'Post this placard where it can be seen from the street.' },
      ],
    })
    const text = await pdfText(bytes)
    expect(await pageCount(bytes)).toBe(1)
    expect(text).toContain('Town of Alder Pond')
    expect(text).not.toContain('Land Use Office')
    expect(text).not.toContain('603-555-0100')
    expect(await imageCount(bytes)).toBe(1)
  })

  it('a signature block draws the signer image, name and title', async () => {
    const bytes = await renderPdf({ ...SHORT, frame: await profileFrame() })
    const text = await pdfText(bytes)
    expect(text).toContain('Ira Inspector')
    expect(text).toContain('Building Official')
    expect(text).not.toContain('Building inspector')
    expect(await imageCount(bytes)).toBe(2)
  })

  it('a signature block without an image draws the rule, name and title', async () => {
    const bytes = await renderPdf({
      ...SHORT,
      frame: await profileFrame(),
      blocks: [{ kind: 'signature', role: 'town_clerk', label: 'Town clerk' }],
    })
    const text = await pdfText(bytes)
    expect(text).toContain('Sam Clerk')
    expect(text).toContain('Town Clerk')
    expect(await imageCount(bytes)).toBe(1)
  })

  it('a signature block for someone other than the configured signer never uses their image', async () => {
    const bytes = await renderPdf({
      ...SHORT,
      frame: await profileFrame(),
      blocks: [
        {
          kind: 'signature',
          role: 'building_official',
          label: 'Building inspector',
          person: { name: 'Remy Deputy', title: 'Deputy Building Official' },
        },
      ],
    })
    const text = await pdfText(bytes)
    expect(text).toContain('Remy Deputy')
    expect(text).not.toContain('Ira Inspector')
    expect(await imageCount(bytes)).toBe(1)
  })

  it('a signature block with no signer on file falls back to its label', async () => {
    expect(await pdfText(await renderPdf(SHORT))).toContain('Building inspector')
  })

  it('prints names outside WinAnsi and marks only characters the font lacks', async () => {
    const bytes = await renderPdf({
      ...SHORT,
      blocks: [{ kind: 'fields', rows: [{ label: 'Payer', value: 'Zoë Łukasz-Ngũgĩ 山田' }] }],
    })
    expect(await pdfText(bytes)).toContain('Zoë Łukasz-Ngũgĩ ??')
  })

  it('a long unbroken value wraps instead of running off the page', async () => {
    const bytes = await renderPdf({
      ...SHORT,
      blocks: [{ kind: 'paragraph', text: 'W'.repeat(400) }],
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
